/**
 * healerExposureAnalysis.ts
 *
 * At each enemy aligned burst window, snapshots healer CC vulnerability:
 *   1. Trinket availability
 *   2. Which enemies have LoS to the healer (can land CC)
 *   3. Healer DR state per CC category at burst start
 *
 * Exposure labels (WoW 12.0, Full → 50% → Immune chain):
 *   Critical  — trinket unavailable + Full DR threat in LoS
 *   Exposed   — Full DR threat in LoS (trinket available), OR 50% DR + trinket unavailable
 *   Pressured — only 50% DR threats in LoS, trinket available
 *   Safe      — all threats pillar-blocked or healer Immune in all relevant categories
 */

import { AtomicArenaCombat, CombatUnitSpec, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { IPlayerCCTrinketSummary } from './ccTrinketAnalysis';
import { fmtTime, specToString } from './cooldowns';
import { DR_CATEGORY_MAP, DRLevel, getDRLevelAtTime } from './drAnalysis';
import { IAlignedBurstWindow } from './enemyCDs';
import { getUnitPositionAtTime, hasLineOfSight } from './losAnalysis';

// ---------------------------------------------------------------------------
// Spec → primary CC fallback (for enemies not yet observed casting CC)
//
// NOTE: This list is class-level, not spec-level. It's a best-effort heuristic
// for enemies who haven't cast CC yet in this match. Observed CC data from
// buildEnemyCCHistory() is always preferred over these defaults.
// Known imprecisions: Rogue (Sub primary = Blind, not Kidney), Druid (Feral
// primary = Cyclone/Maim), Warrior (Stormbolt often > Intimidating Shout).
// Order matters: check "Demon Hunter" before "Hunter".
// ---------------------------------------------------------------------------

const SPEC_PRIMARY_CC: Array<{ keyword: string; spellName: string; category: string }> = [
  { keyword: 'Demon Hunter', spellName: 'Imprison', category: 'Incapacitate' },
  { keyword: 'Death Knight', spellName: 'Strangulate', category: 'Silence' },
  { keyword: 'Mage', spellName: 'Polymorph', category: 'Incapacitate' },
  { keyword: 'Rogue', spellName: 'Kidney Shot', category: 'Stun' },
  { keyword: 'Warlock', spellName: 'Fear', category: 'Disorient' },
  { keyword: 'Druid', spellName: 'Cyclone', category: 'Cyclone' },
  { keyword: 'Hunter', spellName: 'Freezing Trap', category: 'Incapacitate' },
  { keyword: 'Shaman', spellName: 'Hex', category: 'Incapacitate' },
  { keyword: 'Paladin', spellName: 'Repentance', category: 'Incapacitate' },
  { keyword: 'Warrior', spellName: 'Intimidating Shout', category: 'Disorient' },
  { keyword: 'Monk', spellName: 'Paralysis', category: 'Incapacitate' },
  { keyword: 'Priest', spellName: 'Psychic Scream', category: 'Disorient' },
  { keyword: 'Evoker', spellName: 'Landslide', category: 'Disorient' },
];

function getPrimaryCC(specName: string): { spellName: string; category: string } | null {
  for (const entry of SPEC_PRIMARY_CC) {
    if (specName.includes(entry.keyword)) return entry;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealerExposureLabel = 'Critical' | 'Exposed' | 'Pressured' | 'Safe';

export interface IHealerCCThreat {
  enemyName: string;
  enemySpec: string;
  /** DR category of the threat (e.g. "Incapacitate") */
  ccCategory: string;
  /** Representative spell name (e.g. "Polymorph") */
  ccSpellName: string;
  /** DR level healer would be at if this CC lands now */
  healerDRLevel: Exclude<DRLevel, 'Immune'>;
  /** true = this enemy is behind a pillar relative to the healer */
  losBlocked: boolean;
}

export interface IHealerBurstExposure {
  atSeconds: number;
  burstDangerLabel: string;
  trinketState: 'available' | 'on_cooldown' | 'passive';
  /** Seconds from match start when trinket returns, if on_cooldown */
  trinketAvailableAtSeconds: number | null;
  /** All non-Immune threats (both exposed and pillar-blocked) */
  threats: IHealerCCThreat[];
  exposureLabel: HealerExposureLabel;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTrinketStateAtSeconds(
  summary: IPlayerCCTrinketSummary,
  atSeconds: number,
): { state: 'available' | 'on_cooldown' | 'passive'; availableAtSeconds: number | null } {
  // Relentless = passive DR reduction; Adaptation = auto-proc break — neither has a manual CD
  if (summary.trinketType === 'Relentless' || summary.trinketType === 'Adaptation')
    return { state: 'passive', availableAtSeconds: null };
  const lastUse = [...summary.trinketUseTimes].reverse().find((t) => t <= atSeconds) ?? null;
  if (lastUse === null) return { state: 'available', availableAtSeconds: null };
  const readyAt = lastUse + summary.trinketCooldownSeconds;
  if (readyAt <= atSeconds) return { state: 'available', availableAtSeconds: null };
  return { state: 'on_cooldown', availableAtSeconds: readyAt };
}

function computeExposureLabel(
  trinketState: 'available' | 'on_cooldown' | 'passive',
  exposedThreats: IHealerCCThreat[],
): HealerExposureLabel {
  if (exposedThreats.length === 0) return 'Safe';
  const hasFullDR = exposedThreats.some((t) => t.healerDRLevel === 'Full');
  const has50DR = exposedThreats.some((t) => t.healerDRLevel === '50%');
  const trinketUnavailable = trinketState === 'on_cooldown';
  if (hasFullDR && trinketUnavailable) return 'Critical';
  if (hasFullDR) return 'Exposed';
  if (has50DR && trinketUnavailable) return 'Exposed';
  if (has50DR) return 'Pressured';
  return 'Safe';
}

/**
 * Build a map of enemyName → observed CC categories from all friendly CC summaries.
 * Prefer observed data over spec inference — only falls back to spec if no CC observed.
 */
function buildEnemyCCHistory(
  allFriendlyCCSummaries: IPlayerCCTrinketSummary[],
): Map<string, Array<{ spellName: string; category: string }>> {
  const result = new Map<string, Array<{ spellName: string; category: string }>>();
  for (const summary of allFriendlyCCSummaries) {
    for (const cc of summary.ccInstances) {
      const category = DR_CATEGORY_MAP[cc.spellId];
      if (!category) continue;
      const existing = result.get(cc.sourceName) ?? [];
      if (!existing.some((e) => e.category === category)) {
        existing.push({ spellName: cc.spellName, category });
      }
      result.set(cc.sourceName, existing);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

export function analyzeHealerExposureAtBurst(
  burstWindows: IAlignedBurstWindow[],
  enemies: ICombatUnit[],
  healer: ICombatUnit,
  healerCCSummary: IPlayerCCTrinketSummary,
  allFriendlyCCSummaries: IPlayerCCTrinketSummary[],
  zoneId: string,
  matchStartMs: number,
): IHealerBurstExposure[] {
  const enemyCCHistory = buildEnemyCCHistory(allFriendlyCCSummaries);
  const results: IHealerBurstExposure[] = [];

  for (const window of burstWindows) {
    const windowMs = matchStartMs + window.fromSeconds * 1000;

    const healerPos = getUnitPositionAtTime(healer, windowMs);
    if (!healerPos) continue; // no position data — skip

    const { state: trinketState, availableAtSeconds: trinketAvailableAtSeconds } = getTrinketStateAtSeconds(
      healerCCSummary,
      window.fromSeconds,
    );

    const threats: IHealerCCThreat[] = [];

    for (const enemy of enemies) {
      const enemyPos = getUnitPositionAtTime(enemy, windowMs);
      if (!enemyPos) continue;

      const losResult = hasLineOfSight(zoneId, healerPos, enemyPos);
      // null = arena geometry not mapped; treat as unblocked (conservative — assume worst case)
      const losBlocked = losResult === null ? false : !losResult;

      const enemySpec = specToString(enemy.spec);

      // Use observed CC history; fall back to spec-based primary CC
      const observedCCs = enemyCCHistory.get(enemy.name) ?? [];
      const primaryCC = getPrimaryCC(enemySpec);
      const ccSources = observedCCs.length > 0 ? observedCCs : primaryCC ? [primaryCC] : [];

      for (const { spellName, category } of ccSources) {
        const healerDRLevel = getDRLevelAtTime(healerCCSummary.ccInstances, category, window.fromSeconds);
        if (healerDRLevel === 'Immune') continue; // healer is immune — not a threat

        threats.push({
          enemyName: enemy.name,
          enemySpec,
          ccCategory: category,
          ccSpellName: spellName,
          healerDRLevel: healerDRLevel as Exclude<DRLevel, 'Immune'>,
          losBlocked,
        });
      }
    }

    if (threats.length === 0) continue;

    const exposedThreats = threats.filter((t) => !t.losBlocked);
    const exposureLabel = computeExposureLabel(trinketState, exposedThreats);

    results.push({
      atSeconds: window.fromSeconds,
      burstDangerLabel: window.dangerLabel,
      trinketState,
      trinketAvailableAtSeconds,
      threats,
      exposureLabel,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

export function formatHealerExposureForContext(exposures: IHealerBurstExposure[]): string[] {
  if (exposures.length === 0) return [];

  const lines: string[] = [];
  lines.push('HEALER EXPOSURE DURING ENEMY BURST WINDOWS:');

  for (const e of exposures) {
    const trinketStr =
      e.trinketState === 'available'
        ? 'trinket ready'
        : e.trinketState === 'passive'
          ? 'passive trinket'
          : `trinket on CD${e.trinketAvailableAtSeconds !== null ? ` (back ${fmtTime(e.trinketAvailableAtSeconds)})` : ''}`;

    const labelStr =
      e.exposureLabel === 'Critical' ? '⚠ CRITICAL' : e.exposureLabel === 'Exposed' ? '⚠ Exposed' : e.exposureLabel;

    lines.push('');
    lines.push(`  [${fmtTime(e.atSeconds)}] ${e.burstDangerLabel} burst — healer: ${trinketStr} — ${labelStr}`);

    const exposed = e.threats.filter((t) => !t.losBlocked);
    const blocked = e.threats.filter((t) => t.losBlocked);

    for (const t of exposed) {
      const drStr = t.healerDRLevel === 'Full' ? 'Full DR — full duration CC' : '50% DR — half duration CC';
      lines.push(`    IN LoS: ${t.enemySpec} (${t.enemyName}) — ${t.ccSpellName} [${t.ccCategory}] — ${drStr}`);
    }

    if (blocked.length > 0) {
      const names = [...new Set(blocked.map((t) => `${t.enemySpec} (${t.enemyName})`))].join(', ');
      lines.push(`    Pillar-blocked: ${names}`);
    }

    if (e.exposureLabel === 'Critical') {
      lines.push(`    → No trinket + Full DR CC in LoS: healer cannot answer CC`);
    } else if (e.exposureLabel === 'Exposed' && exposed.some((t) => t.healerDRLevel === 'Full')) {
      lines.push(`    → Full DR threat in LoS: trinket is the only answer`);
    }
  }

  return lines;
}

// ─── Healer CC avoidance (#7) ──────────────────────────────────────────────

interface IAvoidanceSpell {
  spellId: string;
  name: string;
  cooldownSeconds: number;
}

const HEALER_AVOIDANCE_SPELLS: Partial<Record<CombatUnitSpec, IAvoidanceSpell[]>> = {
  [CombatUnitSpec.Shaman_Restoration]: [{ spellId: '8177', name: 'Grounding Totem', cooldownSeconds: 25 }],
  [CombatUnitSpec.Priest_Holy]: [{ spellId: '586', name: 'Fade', cooldownSeconds: 30 }],
  [CombatUnitSpec.Priest_Discipline]: [{ spellId: '586', name: 'Fade', cooldownSeconds: 30 }],
  [CombatUnitSpec.Paladin_Holy]: [{ spellId: '642', name: 'Divine Shield', cooldownSeconds: 300 }],
  [CombatUnitSpec.Monk_Mistweaver]: [{ spellId: '122783', name: 'Diffuse Magic', cooldownSeconds: 90 }],
  [CombatUnitSpec.Evoker_Preservation]: [{ spellId: '363916', name: 'Obsidian Scales', cooldownSeconds: 60 }],
};

export interface IHealerAvoidanceTool {
  spellId: string;
  spellName: string;
  idleForSeconds: number;
}

export interface IHealerCCReceived {
  atSeconds: number;
  ccSpellName: string;
  ccCategory: string;
  durationSeconds: number;
  teammateLowHp: boolean;
  avoidanceToolsAvailable: IHealerAvoidanceTool[];
}

function lastAvoidanceCastSeconds(unit: ICombatUnit, spellId: string, matchStartMs: number): number | null {
  const casts = unit.spellCastEvents.filter(
    (e) => e.spellId === spellId && e.logLine.event === LogEvent.SPELL_CAST_SUCCESS,
  );
  if (casts.length === 0) return null;
  return (Math.max(...casts.map((e) => e.logLine.timestamp)) - matchStartMs) / 1000;
}

function anyTeammateLowHp(friends: ICombatUnit[], atSeconds: number, matchStartMs: number): boolean {
  const windowMs = 2_000;
  for (const unit of friends) {
    for (const action of unit.advancedActions) {
      const t = action.logLine.timestamp - matchStartMs;
      if (Math.abs(t - atSeconds * 1000) > windowMs) continue;
      if (action.advancedActorMaxHp > 0) {
        const hpPct = action.advancedActorCurrentHp / action.advancedActorMaxHp;
        if (hpPct < 0.75) return true;
      }
    }
  }
  return false;
}

export function buildHealerCCReceivedEvents(
  combat: Pick<AtomicArenaCombat, 'startTime'>,
  healer: ICombatUnit,
  friends: ICombatUnit[],
  ccSummary: Pick<IPlayerCCTrinketSummary, 'ccInstances'>,
): IHealerCCReceived[] {
  const matchStartMs = combat.startTime;
  const avoidanceSpells = HEALER_AVOIDANCE_SPELLS[healer.spec] ?? [];
  const result: IHealerCCReceived[] = [];

  for (const cc of ccSummary.ccInstances) {
    const teammateLowHp = anyTeammateLowHp(friends, cc.atSeconds, matchStartMs);
    if (!teammateLowHp) continue;

    const avoidanceToolsAvailable: IHealerAvoidanceTool[] = [];
    for (const spell of avoidanceSpells) {
      const lastCast = lastAvoidanceCastSeconds(healer, spell.spellId, matchStartMs);
      let availableSince: number;
      if (lastCast === null) {
        availableSince = 0;
      } else {
        const cdReadyAt = lastCast + spell.cooldownSeconds;
        if (cdReadyAt > cc.atSeconds) continue;
        availableSince = cdReadyAt;
      }
      const idleDuration = cc.atSeconds - availableSince;
      if (idleDuration < 1.5) continue;
      avoidanceToolsAvailable.push({
        spellId: spell.spellId,
        spellName: spell.name,
        idleForSeconds: idleDuration,
      });
    }

    result.push({
      atSeconds: cc.atSeconds,
      ccSpellName: cc.spellName,
      ccCategory: cc.drInfo?.category ?? 'Unknown',
      durationSeconds: cc.durationSeconds,
      teammateLowHp,
      avoidanceToolsAvailable,
    });
  }

  return result;
}

export function formatHealerCCReceivedForContext(events: IHealerCCReceived[]): string {
  if (events.length === 0) return '';
  const lines: string[] = ['HEALER CC RECEIVED'];
  for (const ev of events) {
    const t = `${Math.floor(ev.atSeconds / 60)}:${String(Math.floor(ev.atSeconds % 60)).padStart(2, '0')}`;
    if (ev.avoidanceToolsAvailable.length > 0) {
      const tools = ev.avoidanceToolsAvailable
        .map((a) => `${a.spellName} available ${Math.round(a.idleForSeconds)}s prior`)
        .join(', ');
      lines.push(`  [${t}] ${ev.ccSpellName} (${ev.durationSeconds}s) — ${tools}`);
    } else {
      lines.push(`  [${t}] ${ev.ccSpellName} (${ev.durationSeconds}s) — no avoidance tools available`);
    }
  }
  return lines.join('\n');
}
