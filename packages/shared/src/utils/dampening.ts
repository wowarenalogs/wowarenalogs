import { ICombatUnit } from '@wowarenalogs/parser';

import { tanksOrHealers } from './utils';

// DF RULES https://www.icy-veins.com/forums/topic/69530-dampening-and-healing-changes-in-dragonflight-pre-patch-phase-2-arenas/
// Solo Shuffle - Start at 10% Dampening and after 1 minute, ramp up at a pace of 25% per minute
// 2v2 (double DPS) - Start at 10% Dampening and immediately ramp up at a pace of 6% per minute
// 2v2 (with a healer) - Start at 30% Dampening (up from 20%) and immediately ramp up at a pace of 6% per minute
// 3v3 - Start at 10% Dampening and after 3 minutes (down from 5 minutes), ramp up at a pace of 6% per minute

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface DampeningEvent {
  timestamp: number;
  stacks: number;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Pre-computes all dampening aura dose events from the player list, sorted
 * ascending by timestamp. Called once per timeline computation to avoid
 * flatMapping all players on every sample interval.
 */
function buildDampeningEvents(players: ICombatUnit[]): DampeningEvent[] {
  return players
    .flatMap((p) => p.auraEvents)
    .filter((a) => {
      if (a.spellId !== '110310') return false;
      if (a.logLine.event !== 'SPELL_AURA_APPLIED_DOSE') return false;
      return typeof a.logLine.parameters[12] === 'number';
    })
    .map((a) => ({ timestamp: a.timestamp, stacks: a.logLine.parameters[12] as number }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Returns the dampening stack count at or before `upToTimestamp` from a
 * pre-built sorted event list, falling back to `fallback` if no event exists yet.
 */
function getDampeningFromEvents(events: DampeningEvent[], upToTimestamp: number, fallback: number): number {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].timestamp <= upToTimestamp) {
      return events[i].stacks;
    }
  }
  return fallback;
}

// FIX 4: bracket string is checked first; player count is only a fallback for unknown strings.
function computeRules(bracket: string, players: ICombatUnit[]): '2v2' | '2v2_dps' | '3v3' | 'Rated Solo Shuffle' {
  if (bracket === 'Rated Solo Shuffle') {
    return 'Rated Solo Shuffle';
  }
  if (bracket.includes('3v3') || bracket.includes('Three')) {
    return '3v3';
  }
  if (players.length > 4) {
    return '3v3';
  }
  const team0HasHealer = players.some((c) => c.info?.teamId === '0' && tanksOrHealers.includes(c.spec));
  const team1HasHealer = players.some((c) => c.info?.teamId === '1' && tanksOrHealers.includes(c.spec));
  if (team0HasHealer && team1HasHealer) {
    return '2v2';
  }
  return '2v2_dps';
}

function getInitialDampening(bracket: string, players: ICombatUnit[]) {
  const rules = computeRules(bracket, players);
  if (rules === 'Rated Solo Shuffle') {
    return 10;
  }
  if (rules === '2v2_dps') {
    return 10;
  }
  if (rules === '2v2') {
    return 30;
  }
  // 3v3
  return 10;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getDampeningPercentage(bracket: string, players: ICombatUnit[], timestamp: number): number {
  const events = buildDampeningEvents(players);
  const fallback = getInitialDampening(bracket, players);
  // FIX 3: use ?? instead of || so stacks=0 is not conflated with "no data"
  return getDampeningFromEvents(events, timestamp, fallback);
}

// ---------------------------------------------------------------------------
// Burst window danger scoring helpers
// ---------------------------------------------------------------------------

/**
 * Parses match start info and player events to compute the exact or estimated dampening.
 * Returns a value 0–1 (e.g. 0.30 = 30% dampening).
 */
export function computeDampening(matchTimeMs: number, bracket: string, players: ICombatUnit[]): number {
  const damp = getDampeningPercentage(bracket, players, matchTimeMs);
  return Math.min(damp / 100, 1.0);
}

/**
 * Danger multiplier from dampening: the same incoming damage is harder to heal when
 * dampening is high.
 * 0% → 1.0×  |  30% → 1.45×  |  60% → 1.9×
 */
export function dampeningDangerMultiplier(dampening: number): number {
  return 1 + dampening * 1.5;
}

export function fmtDampening(dampening: number): string {
  return `${Math.round(dampening * 100)}%`;
}

// ---------------------------------------------------------------------------
// AI context helpers
// ---------------------------------------------------------------------------

export interface IDampeningSnapshot {
  atSeconds: number;
  dampening: number;
}

/**
 * Returns a sparse timeline of dampening values sampled every 30s, plus the
 * final value at match end. Only includes entries where dampening changed from
 * the previous sample (avoids repetitive flat sections).
 * Events are precomputed once and reused across all sample points (FIX 1).
 */
export function computeDampeningTimeline(
  bracket: string,
  players: ICombatUnit[],
  startTime: number,
  endTime: number,
): IDampeningSnapshot[] {
  const durationMs = endTime - startTime;
  // FIX 1: build event list once, reuse across all sample intervals
  const events = buildDampeningEvents(players);
  const fallback = getInitialDampening(bracket, players);
  const snapshots: IDampeningSnapshot[] = [];
  const INTERVAL_MS = 30_000;

  let prevDamp = -1;
  for (let ms = 0; ms <= durationMs; ms += INTERVAL_MS) {
    const damp = getDampeningFromEvents(events, startTime + ms, fallback) / 100;
    if (damp !== prevDamp) {
      snapshots.push({ atSeconds: ms / 1000, dampening: damp });
      prevDamp = damp;
    }
  }

  // Always include the final value if not already captured
  const finalDamp = getDampeningFromEvents(events, endTime, fallback) / 100;
  const durationSeconds = durationMs / 1000;
  if (snapshots.length === 0 || snapshots[snapshots.length - 1].dampening !== finalDamp) {
    snapshots.push({ atSeconds: durationSeconds, dampening: finalDamp });
  }

  return snapshots;
}

export function formatDampeningForContext(
  bracket: string,
  players: ICombatUnit[],
  startTime: number,
  endTime: number,
): string[] {
  const timeline = computeDampeningTimeline(bracket, players, startTime, endTime);
  const initialDamp = timeline[0].dampening;
  const finalDamp = timeline[timeline.length - 1].dampening;

  // Suppress for short matches or when dampening barely moved — noise with no analytical value
  const durationSeconds = (endTime - startTime) / 1000;
  if (durationSeconds < 90 && finalDamp < 0.15) return [];

  const lines: string[] = [];

  // Compact single-line summary — the ramp schedule is fixed per bracket so only the
  // endpoint matters for AI reasoning. Full timeline is visible in the Dispels UI tab.
  lines.push(
    `DAMPENING (${bracket}): started at ${fmtDampening(initialDamp)}, ended at ${fmtDampening(finalDamp)} at match end`,
  );

  if (finalDamp >= 0.4) {
    lines.push(
      `  ⚠ Severe dampening (${fmtDampening(finalDamp)}) — sustained healing was severely compromised; kill windows in the final phase required significantly less setup.`,
    );
  } else if (finalDamp >= 0.2) {
    lines.push(
      `  Note: Reached ${fmtDampening(finalDamp)} dampening — healing was meaningfully impaired in the late game.`,
    );
  }

  return lines;
}
