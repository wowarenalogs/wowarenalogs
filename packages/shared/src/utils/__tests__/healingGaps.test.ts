/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitReaction, CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

import { detectHealingGaps } from '../healingGaps';
import { makeAdvancedAction, makeDamageEvent, makeUnit } from './testHelpers';

const MATCH_START = 10_000;
const MATCH_END = 60_000;

function makeCombat(startTime = MATCH_START, endTime = MATCH_END) {
  return { startTime, endTime };
}

function makeHealer(id: string, healOutTimestamps: number[] = [], maxHp = 500_000) {
  const healOut = healOutTimestamps.map((ts) => ({
    logLine: { event: LogEvent.SPELL_HEAL, timestamp: ts, parameters: [] },
    timestamp: ts,
    effectiveAmount: 10_000,
    srcUnitId: id,
  }));
  return makeUnit(id, {
    name: 'Healer',
    reaction: CombatUnitReaction.Friendly,
    spec: CombatUnitSpec.Paladin_Holy,
    healOut: healOut as any,
    advancedActions: [makeAdvancedAction(MATCH_START, 0, 0, maxHp, maxHp)],
  });
}

function makeTeammate(
  id: string,
  damageEvents: Array<{ timestamp: number; amount: number }>,
  maxHp = 500_000,
  reaction = CombatUnitReaction.Friendly,
) {
  const damageIn = damageEvents.map((e) => makeDamageEvent(e.timestamp, e.amount, id));
  return makeUnit(id, {
    name: id,
    reaction,
    damageIn: damageIn as any,
    advancedActions: [makeAdvancedAction(MATCH_START, 0, 0, maxHp, maxHp)],
  });
}

function makeEnemy(id: string) {
  return makeUnit(id, { name: id, reaction: CombatUnitReaction.Hostile });
}

// ---------------------------------------------------------------------------
// Core detection logic
// ---------------------------------------------------------------------------

describe('detectHealingGaps', () => {
  it('returns empty when healer casts continuously', () => {
    const healer = makeHealer('healer-1', [15_000, 17_000, 20_000, 23_000, 26_000]);
    const teammate = makeTeammate('dps-1', [{ timestamp: 21_000, amount: 60_000 }]);
    const enemy = makeEnemy('enemy-1');
    const gaps = detectHealingGaps(healer, [healer, teammate], [enemy], makeCombat());
    expect(gaps).toHaveLength(0);
  });

  it('detects a gap when healer is inactive for >3.5s and teammate is under pressure', () => {
    // Healer casts at T=15s, then nothing until T=22s (7s gap).
    // Teammate takes 50k damage in [15s, 22s] — with 500k HP, threshold is 50k (10%).
    const healer = makeHealer('healer-1', [15_000, 22_000]);
    const teammate = makeTeammate('dps-1', [{ timestamp: 18_000, amount: 50_000 }]);
    const enemy = makeEnemy('enemy-1');
    const gaps = detectHealingGaps(healer, [healer, teammate], [enemy], makeCombat());
    expect(gaps).toHaveLength(1);
    expect(gaps[0].durationSeconds).toBeCloseTo(7, 0);
  });

  it('B47: detects gap with 10–14% HP damage (below old 15% threshold, above new 10%)', () => {
    // Teammate takes 55k damage in gap — 55k / 500k = 11%. Old threshold (15%) = 75k → missed.
    // New threshold (10%) = 50k → should fire.
    const healer = makeHealer('healer-1', [15_000, 23_000]);
    const teammate = makeTeammate('dps-1', [{ timestamp: 19_000, amount: 55_000 }]);
    const enemy = makeEnemy('enemy-1');
    const gaps = detectHealingGaps(healer, [healer, teammate], [enemy], makeCombat());
    expect(gaps).toHaveLength(1);
  });

  it('does NOT detect a gap when teammate damage is below 10% HP threshold', () => {
    // Teammate takes only 40k / 500k = 8% — below new 10% threshold.
    const healer = makeHealer('healer-1', [15_000, 22_000]);
    const teammate = makeTeammate('dps-1', [{ timestamp: 18_000, amount: 40_000 }]);
    const enemy = makeEnemy('enemy-1');
    const gaps = detectHealingGaps(healer, [healer, teammate], [enemy], makeCombat());
    expect(gaps).toHaveLength(0);
  });

  it('suppresses gaps shorter than 3.5s', () => {
    // Only 3s between casts — below HEALING_GAP_THRESHOLD_MS.
    const healer = makeHealer('healer-1', [15_000, 18_000]);
    const teammate = makeTeammate('dps-1', [{ timestamp: 16_500, amount: 200_000 }]);
    const enemy = makeEnemy('enemy-1');
    const gaps = detectHealingGaps(healer, [healer, teammate], [enemy], makeCombat());
    expect(gaps).toHaveLength(0);
  });

  it('B19: suppresses gaps that start within the first 5s of the match', () => {
    // Gap from 10s to 18s (match starts at 10s, first cast at 18s).
    // First 5s grace → gap starts at 10s, which is within grace window.
    const healer = makeHealer('healer-1', [18_000]);
    const teammate = makeTeammate('dps-1', [{ timestamp: 12_000, amount: 100_000 }]);
    const enemy = makeEnemy('enemy-1');
    const gaps = detectHealingGaps(healer, [healer, teammate], [enemy], makeCombat());
    expect(gaps).toHaveLength(0);
  });

  it('uses fallback threshold (40k) when no advanced logging', () => {
    // No advancedActions → falls back to GAP_PRESSURE_FALLBACK_DPS = 40k.
    // 42k damage → above fallback → gap should fire.
    const healer = makeUnit('healer-1', {
      name: 'Healer',
      spec: CombatUnitSpec.Paladin_Holy,
      reaction: CombatUnitReaction.Friendly,
      healOut: [
        {
          logLine: { event: LogEvent.SPELL_HEAL, timestamp: 15_000, parameters: [] },
          timestamp: 15_000,
          effectiveAmount: 10_000,
          srcUnitId: 'healer-1',
        },
        {
          logLine: { event: LogEvent.SPELL_HEAL, timestamp: 23_000, parameters: [] },
          timestamp: 23_000,
          effectiveAmount: 10_000,
          srcUnitId: 'healer-1',
        },
      ] as any,
    });
    const teammate = makeUnit('dps-1', {
      name: 'DPS',
      reaction: CombatUnitReaction.Friendly,
      damageIn: [makeDamageEvent(19_000, 42_000, 'dps-1')] as any,
    });
    const enemy = makeEnemy('enemy-1');
    const gaps = detectHealingGaps(healer, [healer, teammate], [enemy], makeCombat());
    expect(gaps).toHaveLength(1);
  });
});
