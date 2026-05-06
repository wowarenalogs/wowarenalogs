/**
 * drAnalysis.ts — F15: Diminishing Returns Chain Tracking
 *
 * Tracks DR state per target per category so Claude can assess:
 *   - Why a CC had shorter than expected duration (incoming: hit at 50% DR)
 *   - Whether friendly CC chains were wasted by hitting DR (outgoing)
 *
 * DR mechanics (WoW 12.0+):
 *   - CC spells are grouped into DR categories that share diminishing returns
 *   - First application on target: Full duration
 *   - Second within 16s of previous removal: 50%
 *   - Third within 16s: Immune (0%) — 25% tier removed in 12.0
 *   - The 16s reset timer starts from REMOVAL of the previous CC in the sequence
 */

import {
  CombatUnitReaction,
  CombatUnitType,
  IArenaMatch,
  ICombatUnit,
  IShuffleRound,
  LogEvent,
} from '@wowarenalogs/parser';

import spellClassMap from '../data/spellClassMap.json';
import { ccSpellIds } from '../data/spellTags';
import { specToString } from './cooldowns';

// ── DR category constants ─────────────────────────────────────────────────────

export const DR_RESET_MS = 16_000;

// spellClassMap DR categories to import, mapped to display names.
// 'taunt' and 'root' are excluded — not relevant for PvP CC analysis.
const SCM_CATEGORY_LABELS: Record<string, string> = {
  stun: 'Stun',
  knockback: 'Knockback',
  incapacitate: 'Incapacitate',
  disorient: 'Disorient',
  silence: 'Silence',
  disarm: 'Disarm',
};

/**
 * Maps spell ID → DR category name.
 * Generated from spellClassMap.json (DB2 DiminishType data) plus a manual supplement
 * for spells absent from DB2: racials/pets not resolvable to player specs, silences
 * missing the DB2 flag, and DR categories that don't exist in DB2 (Cyclone, Horror).
 *
 * DB2 overrides are applied last to correct known Blizzard data errors:
 *   - Cyclone (33786): DB2 groups with Disorient; WoW gives it its own DR category
 *   - Incapacitating Roar (99): DB2 groups with Incapacitate; WoW treats as Disorient
 *
 * To update after a patch: re-run `generateSpellClassMap` (packages/tools), then verify
 * the supplement below is still accurate.
 */
export const DR_CATEGORY_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};

  const dr = spellClassMap.diminishingReturns as Record<string, { spellId: string }[]>;
  for (const [cat, entries] of Object.entries(dr)) {
    const label = SCM_CATEGORY_LABELS[cat];
    if (!label) continue;
    for (const entry of entries) {
      map[entry.spellId] = label;
    }
  }

  // Supplement: racials and pet abilities not resolvable to player specs in DB2
  map['20549'] = 'Stun'; // War Stomp (Tauren racial)
  map['24394'] = 'Stun'; // Intimidation (Hunter pet)
  map['107079'] = 'Stun'; // Quaking Palm (Pandaren racial)

  // Supplement: AoE CC rank variants sharing DR with their base spell
  map['316593'] = 'Disorient'; // Intimidating Shout rank 2 (base 5246 = Disorient)
  map['316595'] = 'Disorient'; // Intimidating Shout rank 3
  map['6358'] = 'Disorient'; // Seduction (Warlock pet)

  // Supplement: silences missing DB2 DiminishType flag
  map['47476'] = 'Silence'; // Strangulate (Death Knight)
  map['81261'] = 'Silence'; // Solar Beam (Druid) — zone silence
  map['204490'] = 'Silence'; // Sigil of Silence (Demon Hunter)

  // Supplement: DR categories absent from DB2 DiminishType system
  map['64044'] = 'Horror'; // Psychic Horror (Shadow Priest)

  // DB2 override: Cyclone has its own DR category in WoW, not shared with Disorient
  map['33786'] = 'Cyclone';

  // DB2 override: Incapacitating Roar is Disorient in WoW, not Incapacitate
  map['99'] = 'Disorient';

  return map;
})();

/**
 * Spell IDs whose single cast can apply CC to multiple enemy targets simultaneously.
 * Used to group SPELL_AURA_APPLIED events from analyzeOutgoingCCChains into per-cast AoE events.
 */
export const AOE_CC_SPELL_IDS = new Set<string>([
  '8122', // Psychic Scream (Priest)
  '5246', // Intimidating Shout (Warrior)
  '316593', // Intimidating Shout (rank 2)
  '316595', // Intimidating Shout (rank 3)
  '5484', // Howl of Terror (Warlock)
  '77505', // Shockwave (Warrior)
  '119381', // Leg Sweep (Monk)
  '20549', // War Stomp (Tauren racial)
  '99', // Incapacitating Roar (Druid Bear)
  '30283', // Shadowfury (Warlock) — small AoE on impact
  '255941', // Bursting Shot (Hunter) — disorients group
  '207685', // Sigil of Misery (Demon Hunter) — AoE incapacitate
]);

export interface IAoeCCEvent {
  casterName: string;
  spellId: string;
  spellName: string;
  atSeconds: number;
  /** Each enemy target affected, in order of first application */
  targets: Array<{ name: string; durationSeconds: number }>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type DRLevel = 'Full' | '50%' | '25%' | 'Immune';

export interface IDRInfo {
  /** DR category name (Stun / Incapacitate / Disorient / etc.) */
  category: string;
  /** DR level this application landed at */
  level: DRLevel;
  /** How many prior CCs in the same category were in this sequence */
  sequenceIndex: number;
}

interface CCEntry {
  applyMs: number;
  removeMs: number;
  spellId: string;
}

// ── Core DR computation ───────────────────────────────────────────────────────

/**
 * Returns the DR category key for a spell ID.
 * For unknown spells, falls back to the spell ID itself (self-DR only).
 */
export function getDRCategory(spellId: string): string {
  return DR_CATEGORY_MAP[spellId] ?? `spell:${spellId}`;
}

/**
 * Given the history of previous CC applications (same category, same target),
 * compute the DR level AND sequence index for a new application at `newApplyMs`.
 *
 * Both values are derived from the same backward-walking chain algorithm so they
 * are always mathematically consistent. Callers must NOT compute sequenceIndex
 * independently (e.g. via a flat 18s window filter) — that diverges for long chains.
 *
 * Note on 'Immune': this function can return Immune mathematically (≥3 prior in chain),
 * but in practice WoW does not create an aura event for immune casts. Callers working
 * from auraEvents will never receive an Immune result in the outgoing-CC path.
 * The type is kept for correctness in the incoming-CC path (duration already recorded).
 */
export function getDRLevel(history: CCEntry[], newApplyMs: number): { level: DRLevel; sequenceIndex: number } {
  let chainLength = 0;
  let checkTime = newApplyMs;

  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.removeMs > newApplyMs) {
      // CC was still active when the new one was applied — still counts toward DR
      chainLength++;
      checkTime = entry.applyMs;
    } else if (checkTime - entry.removeMs < DR_RESET_MS) {
      // Within reset window — part of the chain
      chainLength++;
      checkTime = entry.applyMs;
    } else {
      break; // DR chain reset
    }
  }

  // WoW 12.0: Full → 50% → Immune (25% tier removed)
  const level: DRLevel = chainLength === 0 ? 'Full' : chainLength === 1 ? '50%' : 'Immune';
  return { level, sequenceIndex: chainLength };
}

/**
 * Point-in-time DR query: given a unit's incoming CC history, returns the DR
 * level that the NEXT CC of `category` would land at if applied at `atSeconds`.
 *
 * Used by healer exposure analysis to know how much a CC would hurt at burst start.
 */
export function getDRLevelAtTime(
  ccInstances: ReadonlyArray<{ atSeconds: number; durationSeconds: number; drInfo: IDRInfo | null }>,
  category: string,
  atSeconds: number,
): DRLevel {
  const DR_RESET_S = DR_RESET_MS / 1000;

  const relevant = ccInstances
    .filter((cc) => cc.drInfo?.category === category && cc.atSeconds < atSeconds)
    .slice()
    .sort((a, b) => a.atSeconds - b.atSeconds);

  if (relevant.length === 0) return 'Full';

  let chainLength = 0;
  let lastExpiredAt = -Infinity;

  for (const cc of relevant) {
    if (cc.atSeconds - lastExpiredAt > DR_RESET_S) {
      chainLength = 0;
    }
    chainLength++;
    lastExpiredAt = cc.atSeconds + cc.durationSeconds;
  }

  if (atSeconds - lastExpiredAt > DR_RESET_S) return 'Full';
  return chainLength === 1 ? '50%' : 'Immune';
}

// ── Incoming CC DR annotation ─────────────────────────────────────────────────

/**
 * Computes DR info for a list of CC instances received by a single target,
 * in chronological order. Returns a parallel array of IDRInfo (or null if the
 * spell ID is not in ccSpellIds).
 */
export function computeIncomingDR(
  ccInstances: Array<{ atSeconds: number; durationSeconds: number; spellId: string }>,
  matchStartMs: number,
): Array<IDRInfo | null> {
  // Per DR-category history: list of resolved {applyMs, removeMs}
  const history: Map<string, CCEntry[]> = new Map();

  return ccInstances.map((cc) => {
    if (!ccSpellIds.has(cc.spellId)) return null;

    const applyMs = matchStartMs + cc.atSeconds * 1000;
    const removeMs = applyMs + cc.durationSeconds * 1000;
    const category = getDRCategory(cc.spellId);

    const cat = history.get(category) ?? [];
    const { level, sequenceIndex } = getDRLevel(cat, applyMs);

    cat.push({ applyMs, removeMs, spellId: cc.spellId });
    history.set(category, cat);

    return { category: DR_CATEGORY_MAP[cc.spellId] ?? 'Unknown', level, sequenceIndex };
  });
}

// ── Outgoing CC chain analysis ────────────────────────────────────────────────

export interface IOutgoingCCApplication {
  atSeconds: number;
  durationSeconds: number;
  spellId: string;
  spellName: string;
  casterName: string;
  casterSpec: string;
  drInfo: IDRInfo;
}

export interface IOutgoingCCChain {
  targetName: string;
  targetSpec: string;
  applications: IOutgoingCCApplication[];
  /** True if any application hit 25% DR or Immune */
  hasWastedApplications: boolean;
}

/**
 * Scans enemy aura events for CC spells cast by friendly players.
 * Returns per-enemy CC chains annotated with DR levels.
 * Only returns chains that have at least one application at reduced DR (>= 50% reduction).
 */
export function analyzeOutgoingCCChains(
  friendlies: ICombatUnit[],
  enemies: ICombatUnit[],
  combat: IArenaMatch | IShuffleRound,
): IOutgoingCCChain[] {
  const friendlyIds = new Set(friendlies.map((f) => f.id));
  const friendlySpecMap = new Map(friendlies.map((f) => [f.id, specToString(f.spec)]));
  const matchStartMs = combat.startTime;

  return enemies
    .filter((e) => e.type === CombatUnitType.Player && e.reaction === CombatUnitReaction.Hostile)
    .map((enemy) => {
      // Per DR-category history on this enemy
      const history: Map<string, CCEntry[]> = new Map();
      const pending: Map<string, { applyMs: number; spellName: string; srcId: string; srcName: string }> = new Map();
      const applications: IOutgoingCCApplication[] = [];

      // Helper: close a pending CC entry and push it to applications + history
      const closePending = (key: string, removeMs: number) => {
        const p = pending.get(key);
        if (!p) return;
        pending.delete(key);

        const spellId = key.split(':')[0];
        if (!spellId) return;
        const category = getDRCategory(spellId);
        const cat = history.get(category) ?? [];
        const { level, sequenceIndex } = getDRLevel(cat, p.applyMs);
        const durationSeconds = (removeMs - p.applyMs) / 1000;

        cat.push({ applyMs: p.applyMs, removeMs, spellId });
        history.set(category, cat);

        applications.push({
          atSeconds: (p.applyMs - matchStartMs) / 1000,
          durationSeconds,
          spellId,
          spellName: p.spellName,
          casterName: p.srcName,
          casterSpec: friendlySpecMap.get(p.srcId) ?? 'Unknown',
          drInfo: {
            category: DR_CATEGORY_MAP[spellId] ?? 'Unknown',
            level,
            sequenceIndex,
          },
        });
      };

      for (const aura of enemy.auraEvents) {
        const { spellId } = aura;
        if (!spellId || !ccSpellIds.has(spellId)) continue;
        if (!friendlyIds.has(aura.srcUnitId)) continue;

        const key = `${spellId}:${aura.srcUnitId}`;
        const event = aura.logLine.event;

        if (event === LogEvent.SPELL_AURA_APPLIED) {
          pending.set(key, {
            applyMs: aura.timestamp,
            spellName: aura.spellName ?? spellId,
            srcId: aura.srcUnitId,
            srcName: aura.srcUnitName,
          });
        } else if (event === LogEvent.SPELL_AURA_REFRESH) {
          // A refresh means the caster re-applied the CC while it was still active.
          // This immediately burns the next DR tier. Close the prior application and
          // open a new pending entry at the refresh timestamp.
          closePending(key, aura.timestamp);
          pending.set(key, {
            applyMs: aura.timestamp,
            spellName: aura.spellName ?? spellId,
            srcId: aura.srcUnitId,
            srcName: aura.srcUnitName,
          });
        } else if (
          event === LogEvent.SPELL_AURA_REMOVED ||
          event === LogEvent.SPELL_AURA_BROKEN ||
          event === LogEvent.SPELL_AURA_BROKEN_SPELL
        ) {
          closePending(key, aura.timestamp);
        }
      }

      // Close any still-pending CCs at match end
      for (const key of Array.from(pending.keys())) {
        closePending(key, combat.endTime);
      }

      applications.sort((a, b) => a.atSeconds - b.atSeconds);

      return {
        targetName: enemy.name,
        targetSpec: specToString(enemy.spec),
        applications,
        hasWastedApplications: applications.some((a) => a.drInfo.level === '25%' || a.drInfo.level === 'Immune'),
      };
    })
    .filter((chain) => chain.applications.length > 0);
}

// ── Formatters ────────────────────────────────────────────────────────────────

export const DR_LEVEL_LABEL: Record<DRLevel, string> = {
  Full: 'full duration',
  '50%': '50% DR',
  '25%': '25% DR',
  Immune: 'IMMUNE',
};

export function formatOutgoingCCChainsForContext(chains: IOutgoingCCChain[]): string[] {
  const lines: string[] = [];

  // Only output if there are notable DR interactions (reduced or immune applications)
  const notable = chains.filter((c) => c.applications.some((a) => a.drInfo.level !== 'Full'));
  if (notable.length === 0) return lines;

  lines.push('CC APPLIED ON ENEMIES (DR summary):');

  for (const chain of notable) {
    const total = chain.applications.length;
    const immuneCount = chain.applications.filter((a) => a.drInfo.level === 'Immune').length;
    const reducedCount = chain.applications.filter(
      (a) => a.drInfo.level !== 'Full' && a.drInfo.level !== 'Immune',
    ).length;

    // Group by DR category for the summary
    const categoryMap = new Map<string, number>();
    for (const app of chain.applications) {
      categoryMap.set(app.drInfo.category, (categoryMap.get(app.drInfo.category) ?? 0) + 1);
    }
    const categoryStr = [...categoryMap.entries()].map(([cat, count]) => `${count}× ${cat}`).join(', ');

    const wastedNote = chain.hasWastedApplications ? ` ⚠ ${immuneAppsNote(immuneCount)}` : '';

    lines.push(
      `  ${chain.targetSpec} (${chain.targetName}): ${total} CC — ${categoryStr} | ${reducedCount} reduced, ${immuneCount} immune${wastedNote}`,
    );
  }

  return lines;
}

function immuneAppsNote(count: number): string {
  return count > 0 ? `${count} hit immune — switch CC category or target after 2 applications` : 'DR wasted';
}

/**
 * Groups CC applications from outgoing CC chains into per-cast AoE events.
 *
 * Only spells in AOE_CC_SPELL_IDS are included. Applications from the same
 * (spellId, casterName) are split into separate casts whenever the gap from
 * the most recently started event exceeds 0.5s (F66b grouping fix).
 *
 * Single-target applications of whitelisted spells are emitted — they carry
 * tactical signal ("player used AoE fear, caught only 1 enemy").
 */
export function extractAoeCCEvents(chains: IOutgoingCCChain[]): IAoeCCEvent[] {
  const flat: Array<{
    casterName: string;
    spellId: string;
    spellName: string;
    atSeconds: number;
    targetName: string;
    durationSeconds: number;
  }> = [];

  for (const chain of chains) {
    for (const app of chain.applications) {
      if (!AOE_CC_SPELL_IDS.has(app.spellId)) continue;
      flat.push({
        casterName: app.casterName,
        spellId: app.spellId,
        spellName: app.spellName,
        atSeconds: app.atSeconds,
        targetName: chain.targetName,
        durationSeconds: app.durationSeconds,
      });
    }
  }

  flat.sort((a, b) => a.atSeconds - b.atSeconds);

  const GROUPING_WINDOW_S = 0.5;
  const events: IAoeCCEvent[] = [];
  // pairKey → the most recently started event for that (spellId, casterName) pair
  const currentEvent = new Map<string, IAoeCCEvent>();

  for (const app of flat) {
    const pairKey = `${app.spellId}\x00${app.casterName}`;
    const prev = currentEvent.get(pairKey);

    if (prev === undefined || app.atSeconds - prev.atSeconds > GROUPING_WINDOW_S) {
      const evt: IAoeCCEvent = {
        casterName: app.casterName,
        spellId: app.spellId,
        spellName: app.spellName,
        atSeconds: app.atSeconds,
        targets: [{ name: app.targetName, durationSeconds: app.durationSeconds }],
      };
      events.push(evt);
      currentEvent.set(pairKey, evt);
    } else {
      prev.targets.push({ name: app.targetName, durationSeconds: app.durationSeconds });
    }
  }

  return events.sort((a, b) => a.atSeconds - b.atSeconds);
}
