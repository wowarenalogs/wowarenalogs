/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitSpec } from '@wowarenalogs/parser';

import { buildHealerCCReceivedEvents } from '../healerExposureAnalysis';
import { makeAdvancedAction, makeSpellCastEvent, makeUnit } from './testHelpers';

const MATCH_START = 1_000_000;
const MATCH_END = 1_300_000;

function makeCombat() {
  return { startTime: MATCH_START, endTime: MATCH_END };
}

function makeCCSummary(atSeconds: number, durationSeconds: number) {
  return {
    playerName: 'Healer',
    playerSpec: 'Priest Holy',
    trinketType: 'Gladiator',
    trinketCooldownSeconds: 90,
    ccInstances: [
      {
        atSeconds,
        durationSeconds,
        spellId: '118',
        spellName: 'Polymorph',
        sourceName: 'Mage',
        sourceSpec: 'Mage Frost',
        trinketState: 'on_cooldown',
        trinketCooldownSecondsRemaining: null,
        drInfo: { category: 'Incapacitate' },
        damageTakenDuring: 0,
        distanceYards: null,
        losBlocked: null,
      },
    ],
    trinketUseTimes: [],
    missedTrinketWindows: [],
  };
}

function friendAt(id: string, hpPct: number, timestampMs: number) {
  const maxHp = 500_000;
  const currentHp = Math.round(maxHp * hpPct);
  return makeUnit(id, {
    advancedActions: [makeAdvancedAction(timestampMs, 0, 0, maxHp, currentHp)],
  });
}

describe('buildHealerCCReceivedEvents', () => {
  it('returns empty when healer has no CC instances', () => {
    const healer = makeUnit('h1', { spec: CombatUnitSpec.Priest_Holy, name: 'Healer' });
    const ccSummary = { ...makeCCSummary(30, 8), ccInstances: [] };
    const result = buildHealerCCReceivedEvents(makeCombat() as any, healer, [healer], ccSummary as any);
    expect(result).toHaveLength(0);
  });

  it('omits CC event when no teammate was below 75% HP (neutral state gate)', () => {
    const healer = makeUnit('h1', { spec: CombatUnitSpec.Priest_Holy, name: 'Healer' });
    const teammate = friendAt('w1', 0.9, MATCH_START + 29_000);
    const ccSummary = makeCCSummary(30, 8);
    const result = buildHealerCCReceivedEvents(makeCombat() as any, healer, [healer, teammate], ccSummary as any);
    expect(result).toHaveLength(0);
  });

  it('includes CC event when teammate was below 75% HP', () => {
    const healer = makeUnit('h1', { spec: CombatUnitSpec.Priest_Holy, name: 'Healer' });
    const teammate = friendAt('w1', 0.5, MATCH_START + 29_000);
    const ccSummary = makeCCSummary(30, 8);
    const result = buildHealerCCReceivedEvents(makeCombat() as any, healer, [healer, teammate], ccSummary as any);
    expect(result).toHaveLength(1);
    expect(result[0].ccSpellName).toBe('Polymorph');
    expect(result[0].teammateLowHp).toBe(true);
  });

  it('flags Fade as available when never used by Holy Priest', () => {
    const healer = makeUnit('h1', { spec: CombatUnitSpec.Priest_Holy, name: 'Healer' });
    const teammate = friendAt('w1', 0.5, MATCH_START + 29_000);
    const ccSummary = makeCCSummary(30, 8);
    const result = buildHealerCCReceivedEvents(makeCombat() as any, healer, [healer, teammate], ccSummary as any);
    expect(result[0].avoidanceToolsAvailable).toHaveLength(1);
    expect(result[0].avoidanceToolsAvailable[0].spellName).toBe('Fade');
    expect(result[0].avoidanceToolsAvailable[0].idleForSeconds).toBeGreaterThan(1.5);
  });

  it('does NOT flag Fade when used within the last 30s', () => {
    const healer = makeUnit('h1', {
      spec: CombatUnitSpec.Priest_Holy,
      name: 'Healer',
      spellCastEvents: [makeSpellCastEvent('586', MATCH_START + 20_000, 'h1', 'Self', 'h1', 'Healer')],
    });
    const teammate = friendAt('w1', 0.5, MATCH_START + 29_000);
    const ccSummary = makeCCSummary(30, 8);
    const result = buildHealerCCReceivedEvents(makeCombat() as any, healer, [healer, teammate], ccSummary as any);
    expect(result[0].avoidanceToolsAvailable).toHaveLength(0);
  });

  it('includes event with empty avoidanceToolsAvailable when no tools were ready', () => {
    const healer = makeUnit('h1', {
      spec: CombatUnitSpec.Shaman_Restoration,
      name: 'Healer',
      spellCastEvents: [makeSpellCastEvent('8177', MATCH_START + 10_000, 'h1', 'Self', 'h1', 'Healer')],
    });
    const teammate = friendAt('w1', 0.5, MATCH_START + 29_000);
    const ccSummary = makeCCSummary(30, 8);
    const result = buildHealerCCReceivedEvents(makeCombat() as any, healer, [healer, teammate], ccSummary as any);
    expect(result).toHaveLength(1);
    expect(result[0].avoidanceToolsAvailable).toHaveLength(0);
  });
});
