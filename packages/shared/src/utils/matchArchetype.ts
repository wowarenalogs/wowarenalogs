/**
 * matchArchetype.ts
 *
 * Computes raw match measurements for injection into the AI prompt.
 * Intentionally does NOT produce category labels — inject facts, let Claude reason.
 *
 * Measurements:
 *   - Duration and dampening at first death
 *   - Enemy comp: melee count, ranged/caster count, specs
 *   - CC pressure: events per minute, critical/exposed burst window count
 *   - Damage distribution: % of incoming damage per friendly target (tunnel vs. swap signal)
 *   - Burst windows: count and peak danger score
 */

import { AtomicArenaCombat, ICombatUnit } from '@wowarenalogs/parser';

import { IPlayerCCTrinketSummary } from './ccTrinketAnalysis';
import { fmtTime, isHealerSpec, isMeleeSpec, specToString } from './cooldowns';
import { IAlignedBurstWindow } from './enemyCDs';
import { IHealerBurstExposure } from './healerExposureAnalysis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IMatchArchetypeMeasurements {
  durationSeconds: number;
  /** Seconds into the match when the first friendly death occurred; null if no death */
  firstDeathAtSeconds: number | null;
  /** Number of enemy aligned burst windows */
  burstWindowCount: number;
  /** Highest danger score across all burst windows */
  peakBurstScore: number;
  /** Number of burst windows that preceded the first friendly death */
  burstWindowsBeforeFirstDeath: number;
  /** Total CC events received by all friendly players */
  totalFriendlyCCEvents: number;
  /**
   * CC events where the spell is in our DR category map (Stun, Incapacitate, Disorient, etc.).
   * The remainder (totalFriendlyCCEvents - classifiedFriendlyCCEvents) are [Unknown] type:
   * roots, minor incapacitates, or unmapped spells — not hard CC.
   */
  classifiedFriendlyCCEvents: number;
  /** CC events per minute across all friendlies */
  ccEventsPerMinute: number;
  /**
   * Count of healer burst exposure windows rated Critical or Exposed.
   * null when there is no healer in the team (no exposure data collected).
   */
  criticalOrExposedBurstWindows: number | null;
  /** Number of enemy players classified as melee */
  enemyMeleeCount: number;
  /** Number of enemy players classified as ranged/caster (non-healer, non-melee) */
  enemyRangedCount: number;
  /**
   * Max damage received by the most-targeted friendly in any 5s window.
   * Complements burst window score: captures raw pressure kills that don't trigger
   * CD alignment detection (single DPS dumping everything without a coordinated window).
   */
  peakDamagePressure5s: number;
  /**
   * Per-friendly-target: fraction of total incoming damage received (0–1).
   * Sorted descending. High first entry = tunnel game; balanced entries = swap game.
   */
  friendlyDamageShare: Array<{ spec: string; name: string; share: number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function totalDamageReceived(unit: ICombatUnit): number {
  // amount is negative for damage events; absorbsIn represents hits soaked by shields
  const rawDmg = unit.damageIn.reduce((sum, a) => sum + Math.abs(a.amount), 0);
  const absorbed = unit.absorbsIn.reduce((sum, a) => sum + a.absorbedAmount, 0);
  return rawDmg + absorbed;
}

const PEAK_WINDOW_MS = 5000;

/** Max total damage received by a single unit in any PEAK_WINDOW_MS sliding window. */
function peakDamageInWindow(unit: ICombatUnit, matchStartMs: number): number {
  // Build a flat list of (timestamp, amount) sorted ascending
  const events: Array<{ t: number; dmg: number }> = [
    ...unit.damageIn.map((a) => ({ t: a.logLine.timestamp - matchStartMs, dmg: Math.abs(a.amount) })),
    ...unit.absorbsIn.map((a) => ({ t: a.logLine.timestamp - matchStartMs, dmg: a.absorbedAmount })),
  ].sort((a, b) => a.t - b.t);

  if (events.length === 0) return 0;

  let windowSum = 0;
  let peak = 0;
  let left = 0;

  for (let right = 0; right < events.length; right++) {
    windowSum += events[right].dmg;
    while (events[right].t - events[left].t > PEAK_WINDOW_MS) {
      windowSum -= events[left].dmg;
      left++;
    }
    if (windowSum > peak) peak = windowSum;
  }

  return peak;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function computeMatchArchetype(
  friends: ICombatUnit[],
  enemies: ICombatUnit[],
  combat: AtomicArenaCombat,
  ccTrinketSummaries: IPlayerCCTrinketSummary[],
  alignedBurstWindows: IAlignedBurstWindow[],
  healerExposures: IHealerBurstExposure[],
): IMatchArchetypeMeasurements {
  const durationSeconds = (combat.endTime - combat.startTime) / 1000;

  // First friendly death
  const allFriendlyDeaths = friends
    .flatMap((p) => p.deathRecords.map((d) => ({ unit: p, timestamp: d.timestamp })))
    .sort((a, b) => a.timestamp - b.timestamp);
  const firstDeath = allFriendlyDeaths[0] ?? null;
  const firstDeathAtSeconds = firstDeath ? (firstDeath.timestamp - combat.startTime) / 1000 : null;

  // Burst windows
  const burstWindowCount = alignedBurstWindows.length;
  const peakBurstScore = alignedBurstWindows.reduce((max, w) => Math.max(max, w.dangerScore), 0);
  const burstWindowsBeforeFirstDeath =
    firstDeathAtSeconds !== null
      ? alignedBurstWindows.filter((w) => w.fromSeconds < firstDeathAtSeconds).length
      : burstWindowCount;

  // CC pressure
  const totalFriendlyCCEvents = ccTrinketSummaries.reduce((sum, s) => sum + s.ccInstances.length, 0);
  const classifiedFriendlyCCEvents = ccTrinketSummaries.reduce(
    (sum, s) => sum + s.ccInstances.filter((cc) => cc.drInfo !== null).length,
    0,
  );
  const ccEventsPerMinute = durationSeconds > 0 ? (totalFriendlyCCEvents / durationSeconds) * 60 : 0;
  const hasHealer = friends.some((p) => isHealerSpec(p.spec));
  const criticalOrExposedBurstWindows = hasHealer
    ? healerExposures.filter((e) => e.exposureLabel === 'Critical' || e.exposureLabel === 'Exposed').length
    : null;

  // Enemy comp
  const enemyDPS = enemies.filter((e) => !isHealerSpec(e.spec));
  const enemyMeleeCount = enemyDPS.filter((e) => isMeleeSpec(e.spec)).length;
  const enemyRangedCount = enemyDPS.filter((e) => !isMeleeSpec(e.spec)).length;

  // Peak 5s damage pressure — max damage on any single friendly in any 5s window
  const peakDamagePressure5s = friends.reduce((max, p) => Math.max(max, peakDamageInWindow(p, combat.startTime)), 0);

  // Damage distribution — among non-healer friendlies and healer separately
  const friendlyDamageTotals = friends.map((p) => ({
    spec: specToString(p.spec),
    name: p.name,
    dmg: totalDamageReceived(p),
  }));
  const totalDmg = friendlyDamageTotals.reduce((sum, p) => sum + p.dmg, 0);
  const friendlyDamageShare = friendlyDamageTotals
    .map((p) => ({ spec: p.spec, name: p.name, share: totalDmg > 0 ? p.dmg / totalDmg : 0 }))
    .sort((a, b) => b.share - a.share);

  return {
    durationSeconds,
    firstDeathAtSeconds,
    burstWindowCount,
    peakBurstScore,
    burstWindowsBeforeFirstDeath,
    totalFriendlyCCEvents,
    classifiedFriendlyCCEvents,
    ccEventsPerMinute,
    criticalOrExposedBurstWindows,
    enemyMeleeCount,
    enemyRangedCount,
    peakDamagePressure5s,
    friendlyDamageShare,
  };
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

export function formatMatchArchetypeForContext(m: IMatchArchetypeMeasurements): string[] {
  const lines: string[] = [];
  lines.push('MATCH MEASUREMENTS:');

  // Burst window timing relative to first death (duration already in MATCH SUMMARY)
  if (m.firstDeathAtSeconds !== null) {
    lines.push(
      `  First death: ${fmtTime(m.firstDeathAtSeconds)} | Burst windows before death: ${m.burstWindowsBeforeFirstDeath} of ${m.burstWindowCount} total (peak score: ${m.peakBurstScore.toFixed(1)})`,
    );
  } else {
    lines.push(
      `  No friendly deaths | Burst windows: ${m.burstWindowCount} (peak score: ${m.peakBurstScore.toFixed(1)})`,
    );
  }

  // Peak raw pressure — complements burst window score for uncoordinated kills
  const peakPressureK = Math.round(m.peakDamagePressure5s / 1000);
  lines.push(`  Peak damage pressure: ${peakPressureK}k in 5s`);

  // Enemy comp — spec list already in MATCH SUMMARY, just surface the melee/ranged split
  lines.push(`  Enemy comp: ${m.enemyMeleeCount} melee, ${m.enemyRangedCount} ranged/caster`);

  // CC pressure — omit rate for very short matches where events/min is misleading
  const showRate = m.durationSeconds >= 30;
  const ccRateStr = showRate ? ` (${m.ccEventsPerMinute.toFixed(1)}/min)` : '';
  const exposureStr =
    m.criticalOrExposedBurstWindows !== null
      ? ` | Critical/Exposed healer burst windows: ${m.criticalOrExposedBurstWindows}`
      : '';
  const unknownCC = m.totalFriendlyCCEvents - m.classifiedFriendlyCCEvents;
  const ccBreakdownStr =
    m.totalFriendlyCCEvents > 0 ? ` (${m.classifiedFriendlyCCEvents} hard CC, ${unknownCC} unknown/root)` : '';
  lines.push(
    `  CC pressure (all friendlies): ${m.totalFriendlyCCEvents} events${ccBreakdownStr}${ccRateStr}${exposureStr}`,
  );

  // Damage distribution
  if (m.friendlyDamageShare.length > 0) {
    const shareStr = m.friendlyDamageShare
      .map((p) => `${p.spec} (${p.name}): ${Math.round(p.share * 100)}%`)
      .join(', ');
    lines.push(`  Damage received: ${shareStr}`);
  }

  return lines;
}
