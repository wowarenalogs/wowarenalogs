/**
 * drAnalysis.ts — F15: Diminishing Returns Chain Tracking
 *
 * Tracks DR state per target per category so Claude can assess:
 *   - Why a CC had shorter than expected duration (incoming: hit at 50%/25% DR)
 *   - Whether friendly CC chains were wasted by hitting DR (outgoing)
 *
 * DR mechanics (WoW retail):
 *   - CC spells are grouped into DR categories that share diminishing returns
 *   - First application on target: Full duration
 *   - Second within 18s of previous removal: 50%
 *   - Third within 18s: 25%
 *   - Fourth within 18s: Immune (0%)
 *   - The 18s reset timer starts from REMOVAL of the previous CC in the sequence
 */

import {
  CombatUnitReaction,
  CombatUnitType,
  ICombatUnit,
  IArenaMatch,
  IShuffleRound,
  LogEvent,
} from '@wowarenalogs/parser';

import { ccSpellIds } from '../data/spellTags';
import { fmtTime, specToString } from './cooldowns';

// ── DR category constants ─────────────────────────────────────────────────────

export const DR_RESET_MS = 18_000;

/**
 * Maps spell ID → DR category name.
 * Spells sharing a category diminish each other.
 * Spells not listed are treated as their own category (self-DR only).
 *
 * ⚠️ PATCH-VOLATILE: Blizzard occasionally moves spells between DR categories.
 * Verify against https://wowhead.com/pvp-diminishing-returns after major patches.
 */
export const DR_CATEGORY_MAP: Record<string, string> = {
  // ── Stun ─────────────────────────────────────────────────────────────────
  '408': 'Stun', // Kidney Shot (Rogue)
  '853': 'Stun', // Hammer of Justice (Paladin)
  '1833': 'Stun', // Cheap Shot (Rogue)
  '5211': 'Stun', // Bash (Druid)
  '20549': 'Stun', // War Stomp (Tauren racial)
  '24394': 'Stun', // Intimidation (Hunter pet)
  '30283': 'Stun', // Shadowfury (Warlock)
  '77505': 'Stun', // Shockwave (Warrior)
  '107079': 'Stun', // Quaking Palm (Pandaren racial) — actually Incapacitate in some sources; treating as Stun
  '119381': 'Stun', // Leg Sweep (Monk)
  '22570': 'Stun', // Maim (Feral Druid)
  '203337': 'Stun', // Freezing Trap (if it stuns)

  // ── Incapacitate ─────────────────────────────────────────────────────────
  // Polymorph family (Mage) — all share Incapacitate DR with each other
  '118': 'Incapacitate',
  '28271': 'Incapacitate', // Polymorph (Pig)
  '28272': 'Incapacitate', // Polymorph (Cat)
  '61025': 'Incapacitate', // Polymorph (Turtle)
  '61721': 'Incapacitate', // Polymorph (Rabbit)
  '61780': 'Incapacitate', // Polymorph (Turkey)
  '126819': 'Incapacitate', // Polymorph (Porcupine)
  '161353': 'Incapacitate', // Polymorph (Polar Bear Cub)
  '161354': 'Incapacitate', // Polymorph (Monkey)
  '161355': 'Incapacitate', // Polymorph (Penguin)
  '161372': 'Incapacitate', // Polymorph (Peacock)
  // Hex family (Shaman)
  '51514': 'Incapacitate', // Hex
  '61305': 'Incapacitate', // Hex (Frog)
  '277778': 'Incapacitate', // Hex (Cockroach)
  '277784': 'Incapacitate', // Hex (Spider)
  '277787': 'Incapacitate', // Hex (Snake)
  '277792': 'Incapacitate', // Hex (Turtle)
  // Other incapacitates
  '1776': 'Incapacitate', // Gouge (Rogue)
  '3355': 'Incapacitate', // Freezing Trap (Hunter)
  '6770': 'Incapacitate', // Sap (Rogue)
  '20066': 'Incapacitate', // Repentance (Paladin)
  '82691': 'Incapacitate', // Ring of Frost (Mage)
  '115078': 'Incapacitate', // Paralysis (Monk)
  '207777': 'Incapacitate', // Imprison (Demon Hunter)
  '217832': 'Incapacitate', // Imprison variant (DH)

  // ── Disorient ─────────────────────────────────────────────────────────────
  // Fear / disorient effects all share this category
  '5484': 'Disorient', // Howl of Terror (Warlock)
  '5246': 'Disorient', // Intimidating Shout (Warrior)
  '6358': 'Disorient', // Seduction (Warlock Succubus/Incubus)
  '8122': 'Disorient', // Psychic Scream (Priest)
  '31661': 'Disorient', // Dragon's Breath (Mage)
  '99': 'Disorient', // Incapacitating Roar (Druid Bear) — classified as Disorient despite name
  '255941': 'Disorient', // Bursting Shot (Hunter) — disorient, not stun

  // ── Cyclone (own category — shares only with itself) ───────────────────────
  '33786': 'Cyclone', // Cyclone (Druid) — does not share DR with Disorient

  // ── Horror ────────────────────────────────────────────────────────────────
  '6789': 'Horror', // Death Coil (Warlock)
  '64044': 'Horror', // Psychic Horror (Shadow Priest)

  // ── Silence ───────────────────────────────────────────────────────────────
  '15487': 'Silence', // Silence (Priest)
  '47476': 'Silence', // Strangulate (Death Knight)
  '81261': 'Silence', // Solar Beam (Druid) — zone silence
  '207685': 'Silence', // Sigil of Silence (Demon Hunter)

  // ── Blind (own category) ──────────────────────────────────────────────────
  '2094': 'Blind', // Blind (Rogue)
};

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

  const level: DRLevel = chainLength === 0 ? 'Full' : chainLength === 1 ? '50%' : chainLength === 2 ? '25%' : 'Immune';
  return { level, sequenceIndex: chainLength };
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

  lines.push('CC APPLIED ON ENEMIES (DR state):');

  for (const chain of notable) {
    lines.push('');
    lines.push(`  ${chain.targetSpec} (${chain.targetName}):`);

    for (const app of chain.applications) {
      const dur = app.durationSeconds.toFixed(1);
      const drStr = DR_LEVEL_LABEL[app.drInfo.level];
      const seqNote =
        app.drInfo.sequenceIndex > 0
          ? ` — ${ordinal(app.drInfo.sequenceIndex + 1)} ${app.drInfo.category} in sequence`
          : '';
      const warnFlag = app.drInfo.level === 'Immune' ? ' ⚠' : app.drInfo.level === '25%' ? ' ⚠' : '';
      lines.push(
        `    ${fmtTime(app.atSeconds)}: ${app.spellName} by ${app.casterSpec} — ${dur}s [${app.drInfo.category}: ${drStr}${seqNote}]${warnFlag}`,
      );
    }

    if (chain.hasWastedApplications) {
      const immuneApps = chain.applications.filter((a) => a.drInfo.level === 'Immune');
      if (immuneApps.length > 0) {
        lines.push(
          `    ⚠ ${immuneApps.length} application(s) hit immune — switch CC category or target after 2 applications`,
        );
      }
    }
  }

  return lines;
}

function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}
