/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitReaction, CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

import { buildOffensiveWasteSummary } from '../offensiveWasteAnalysis';
import { makeAuraEvent, makeUnit } from './testHelpers';

const MATCH_START = 1_000_000;
const MATCH_END = 1_300_000;

function makeCombat() {
  return { startTime: MATCH_START, endTime: MATCH_END };
}

function makeDamageCast(spellId: string, spellName: string, timestampMs: number, srcId: string, destId: string): any {
  return {
    logLine: { event: LogEvent.SPELL_CAST_SUCCESS, timestamp: timestampMs, parameters: [] },
    timestamp: timestampMs,
    spellId,
    spellName,
    srcUnitId: srcId,
    srcUnitName: 'Attacker',
    destUnitId: destId,
    destUnitName: 'Target',
    effectiveAmount: 50_000,
    advancedActorMaxHp: 0,
    advancedActorCurrentHp: 0,
    advancedActorPositionX: 0,
    advancedActorPositionY: 0,
  };
}

function withDamageOut(unit: any, events: any[]): any {
  unit.damageOut = events;
  return unit;
}

describe('buildOffensiveWasteSummary', () => {
  const enemyId = 'enemy-1';

  it('returns empty when no immunity windows exist', () => {
    const friend = makeUnit('f1', { spec: CombatUnitSpec.DeathKnight_Frost });
    const enemy = makeUnit(enemyId, { reaction: CombatUnitReaction.Hostile });
    const result = buildOffensiveWasteSummary(makeCombat() as any, [friend], [enemy]);
    expect(result.events).toHaveLength(0);
  });

  it('does NOT flag a single cast into immunity (below threshold of 2)', () => {
    const enemy = makeUnit(enemyId, {
      reaction: CombatUnitReaction.Hostile,
      spec: CombatUnitSpec.Paladin_Holy,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '642', MATCH_START + 30_000, enemyId, enemyId, 'BUFF'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '642', MATCH_START + 38_000, enemyId, enemyId, 'BUFF'),
      ],
    });
    const cast1 = makeDamageCast('194913', 'Obliterate', MATCH_START + 32_000, 'f1', enemyId);
    const friend = withDamageOut(makeUnit('f1', { spec: CombatUnitSpec.DeathKnight_Frost }), [cast1]);
    friend.spellCastEvents = [cast1];
    const result = buildOffensiveWasteSummary(makeCombat() as any, [friend], [enemy]);
    expect(result.events).toHaveLength(0);
  });

  it('flags ≥2 high-value casts into an immunity window', () => {
    const enemy = makeUnit(enemyId, {
      reaction: CombatUnitReaction.Hostile,
      spec: CombatUnitSpec.Paladin_Holy,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '642', MATCH_START + 30_000, enemyId, enemyId, 'BUFF'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '642', MATCH_START + 38_000, enemyId, enemyId, 'BUFF'),
      ],
    });
    const cast1 = makeDamageCast('49998', 'Death Strike', MATCH_START + 32_000, 'f1', enemyId);
    const cast2 = makeDamageCast('43265', 'Death and Decay', MATCH_START + 34_000, 'f1', enemyId);
    const friend = withDamageOut(makeUnit('f1', { spec: CombatUnitSpec.DeathKnight_Frost }), [cast1, cast2]);
    friend.spellCastEvents = [cast1, cast2];
    const result = buildOffensiveWasteSummary(makeCombat() as any, [friend], [enemy]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].defenseType).toBe('immunity');
    expect(result.events[0].defenseName).toBe('Divine Shield');
    expect(result.events[0].wasteCasts).toHaveLength(2);
  });

  it('flags ≥3 casts into a major DR window', () => {
    const enemy = makeUnit(enemyId, {
      reaction: CombatUnitReaction.Hostile,
      spec: CombatUnitSpec.Warrior_Arms,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '102342', MATCH_START + 50_000, 'd1', enemyId, 'BUFF'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '102342', MATCH_START + 58_000, 'd1', enemyId, 'BUFF'),
      ],
    });
    const cast1 = makeDamageCast('1', 'Chaos Strike', MATCH_START + 51_000, 'f1', enemyId);
    const cast2 = makeDamageCast('2', 'Blade Dance', MATCH_START + 53_000, 'f1', enemyId);
    const cast3 = makeDamageCast('3', 'The Hunt', MATCH_START + 55_000, 'f1', enemyId);
    const friend = withDamageOut(makeUnit('f1', { spec: CombatUnitSpec.DemonHunter_Havoc }), [cast1, cast2, cast3]);
    friend.spellCastEvents = [cast1, cast2, cast3];
    const result = buildOffensiveWasteSummary(makeCombat() as any, [friend], [enemy]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].defenseType).toBe('major_dr');
    expect(result.events[0].defenseName).toBe('Ironbark');
    expect(result.events[0].wasteCasts).toHaveLength(3);
  });

  it('does not flag casts against a DIFFERENT enemy during the immunity window', () => {
    const enemy1 = makeUnit(enemyId, {
      reaction: CombatUnitReaction.Hostile,
      spec: CombatUnitSpec.Paladin_Holy,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '642', MATCH_START + 30_000, enemyId, enemyId, 'BUFF'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '642', MATCH_START + 38_000, enemyId, enemyId, 'BUFF'),
      ],
    });
    const enemy2 = makeUnit('enemy-2', { reaction: CombatUnitReaction.Hostile });
    const cast1 = makeDamageCast('1', 'Spell A', MATCH_START + 32_000, 'f1', 'enemy-2');
    const cast2 = makeDamageCast('2', 'Spell B', MATCH_START + 34_000, 'f1', 'enemy-2');
    const friend = withDamageOut(makeUnit('f1', { spec: CombatUnitSpec.DeathKnight_Frost }), [cast1, cast2]);
    friend.spellCastEvents = [cast1, cast2];
    const result = buildOffensiveWasteSummary(makeCombat() as any, [friend], [enemy1, enemy2]);
    expect(result.events).toHaveLength(0);
  });
});
