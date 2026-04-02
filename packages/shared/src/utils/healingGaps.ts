import { ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import spellsData from '../data/spells.json';
import { fmtTime, getPressureThreshold, specToString } from './cooldowns';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEALING_GAP_THRESHOLD_MS = 3500;
/** Healer must have this many ms of free (non-CC) time to have realistically cast a heal */
const MIN_FREE_CAST_MS = 1500;
/** Grace period: ignore tail gaps within this many ms of match end (match may end mid-cast) */
const TAIL_GRACE_MS = 5000;

// Spell types that prevent the healer from casting
const CAST_PREVENTING_TYPES = new Set(['cc', 'immunities_spells']);

type SpellEntry = { type: string };
const SPELLS = spellsData as Record<string, SpellEntry>;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface IHealingGap {
  fromSeconds: number;
  toSeconds: number;
  durationSeconds: number;
  /** Gap duration minus CC/silence time — the healer's actual free window */
  freeCastSeconds: number;
  /** Name of the teammate who took the most damage during this gap */
  mostDamagedName: string;
  mostDamagedSpec: string;
  /** Raw damage taken by the most-pressured teammate */
  mostDamagedAmount: number;
}

// ---------------------------------------------------------------------------
// CC coverage helper
// ---------------------------------------------------------------------------

/**
 * Returns the total milliseconds within [fromMs, toMs] during which the unit
 * was in a cast-preventing effect (hard CC or silence) sourced from an enemy.
 * Uses merged-interval math to avoid double-counting overlapping CC.
 */
function getCCCoveredMs(unit: ICombatUnit, fromMs: number, toMs: number, enemyIds: Set<string>): number {
  const applied = new Map<string, number[]>();
  const removed = new Map<string, number[]>();

  for (const aura of unit.auraEvents) {
    const spellId = aura.spellId;
    if (!spellId) continue;
    if (!enemyIds.has(aura.srcUnitId)) continue;
    const spell = SPELLS[spellId];
    if (!spell || !CAST_PREVENTING_TYPES.has(spell.type)) continue;

    if (aura.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
      const b = applied.get(spellId) ?? [];
      applied.set(spellId, [...b, aura.timestamp]);
    } else if (
      aura.logLine.event === LogEvent.SPELL_AURA_REMOVED ||
      aura.logLine.event === LogEvent.SPELL_AURA_BROKEN ||
      aura.logLine.event === LogEvent.SPELL_AURA_BROKEN_SPELL
    ) {
      const b = removed.get(spellId) ?? [];
      removed.set(spellId, [...b, aura.timestamp]);
    }
  }

  // Build clipped CC windows
  const windows: Array<{ from: number; to: number }> = [];
  for (const [spellId, applications] of applied) {
    const removals = removed.get(spellId) ?? [];
    for (const applyTs of applications) {
      const removeTs = removals.find((r) => r > applyTs) ?? Infinity;
      const clippedFrom = Math.max(applyTs, fromMs);
      const clippedTo = Math.min(removeTs, toMs);
      if (clippedTo > clippedFrom) {
        windows.push({ from: clippedFrom, to: clippedTo });
      }
    }
  }

  if (windows.length === 0) return 0;

  // Merge overlapping windows and sum
  windows.sort((a, b) => a.from - b.from);
  let covered = 0;
  let cur = windows[0];
  for (let i = 1; i < windows.length; i++) {
    const w = windows[i];
    if (w.from <= cur.to) {
      cur = { from: cur.from, to: Math.max(cur.to, w.to) };
    } else {
      covered += cur.to - cur.from;
      cur = w;
    }
  }
  covered += cur.to - cur.from;
  return covered;
}

// ---------------------------------------------------------------------------
// Main detection
// ---------------------------------------------------------------------------

/**
 * Finds intervals where a healer produced no healOut events or spell casts for >= 3.5s,
 * while a teammate was under significant pressure, and the healer had enough
 * free (non-CC, non-silenced) time to have cast at least one heal.
 */
export function detectHealingGaps(
  healer: ICombatUnit,
  friends: ICombatUnit[],
  enemies: ICombatUnit[],
  combat: { startTime: number; endTime: number },
): IHealingGap[] {
  const enemyIds = new Set(enemies.map((u) => u.id));
  const teammates = friends.filter((u) => u.id !== healer.id);
  const matchStartMs = combat.startTime;
  const matchEndMs = combat.endTime;

  // All timestamps where the healer produced a heal event or successfully cast a spell, sorted ascending
  const healTimestamps = healer.healOut.map((h) => h.logLine.timestamp);
  const castTimestamps = healer.spellCastEvents
    .filter((e) => e.logLine.event === LogEvent.SPELL_CAST_SUCCESS)
    .map((e) => e.logLine.timestamp);

  const activeTimestamps = Array.from(new Set([...healTimestamps, ...castTimestamps])).sort((a, b) => a - b);

  // Build raw gap intervals [fromMs, toMs] where no heal/cast was produced
  const rawGaps: Array<{ fromMs: number; toMs: number }> = [];

  if (activeTimestamps.length === 0) {
    rawGaps.push({ fromMs: matchStartMs, toMs: matchEndMs });
  } else {
    // Gap before first activity
    if (activeTimestamps[0] - matchStartMs > HEALING_GAP_THRESHOLD_MS) {
      rawGaps.push({ fromMs: matchStartMs, toMs: activeTimestamps[0] });
    }
    // Gaps between consecutive activities
    for (let i = 0; i < activeTimestamps.length - 1; i++) {
      const from = activeTimestamps[i];
      const to = activeTimestamps[i + 1];
      if (to - from > HEALING_GAP_THRESHOLD_MS) {
        rawGaps.push({ fromMs: from, toMs: to });
      }
    }
    // Tail gap — only outside the grace window at match end
    const lastActivity = activeTimestamps[activeTimestamps.length - 1];
    if (matchEndMs - lastActivity > HEALING_GAP_THRESHOLD_MS + TAIL_GRACE_MS) {
      rawGaps.push({ fromMs: lastActivity, toMs: matchEndMs });
    }
  }

  const results: IHealingGap[] = [];

  for (const { fromMs, toMs } of rawGaps) {
    // CC check: how much of the gap was the healer unable to cast?
    const ccMs = getCCCoveredMs(healer, fromMs, toMs, enemyIds);
    const freeCastMs = toMs - fromMs - ccMs;
    if (freeCastMs < MIN_FREE_CAST_MS) continue;

    // Pressure check: did any teammate take significant damage in this window?
    let mostDamagedAmount = 0;
    let mostDamagedName = '';
    let mostDamagedSpec = '';
    let anyUnderPressure = false;

    for (const teammate of teammates) {
      const dmg = teammate.damageIn
        .filter((d) => d.logLine.timestamp >= fromMs && d.logLine.timestamp <= toMs)
        .reduce((sum, d) => sum + Math.abs(d.effectiveAmount), 0);

      if (dmg >= getPressureThreshold(teammate)) anyUnderPressure = true;
      if (dmg > mostDamagedAmount) {
        mostDamagedAmount = dmg;
        mostDamagedName = teammate.name;
        mostDamagedSpec = specToString(teammate.spec);
      }
    }

    if (!anyUnderPressure) continue;

    results.push({
      fromSeconds: (fromMs - matchStartMs) / 1000,
      toSeconds: (toMs - matchStartMs) / 1000,
      durationSeconds: (toMs - fromMs) / 1000,
      freeCastSeconds: freeCastMs / 1000,
      mostDamagedName,
      mostDamagedSpec,
      mostDamagedAmount,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

export function formatHealingGapsForContext(gaps: IHealingGap[]): string[] {
  const lines: string[] = [];
  lines.push('HEALING GAPS (healer was inactive for >3.5s while a teammate was under pressure and healer was free):');

  if (gaps.length === 0) {
    lines.push('  None detected.');
    return lines;
  }

  for (const g of gaps) {
    const dmgK = Math.round(g.mostDamagedAmount / 1000);
    const dur = g.durationSeconds.toFixed(1);
    const free = g.freeCastSeconds.toFixed(1);
    lines.push(
      `  ⚠ Free-Cast Gap: From ${fmtTime(g.fromSeconds)} to ${fmtTime(g.toSeconds)} (${dur}s gap, ${free}s free to cast), you cast no heals or spells while your ${g.mostDamagedSpec} (${g.mostDamagedName}) took ${dmgK}k damage. You were not CC'd.`,
    );
  }

  return lines;
}
