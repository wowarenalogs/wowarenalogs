/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

import { buildDeathOutcomeSummary } from '../deathOutcomeAnalysis';
import { makeAuraEvent, makeSpellCastEvent, makeUnit } from './testHelpers';

const MATCH_START = 1_000_000;
const MATCH_END = 1_300_000;

function makeCombat() {
  return { startTime: MATCH_START, endTime: MATCH_END };
}

function makeDeadUnit(id: string, deathTimestampMs: number, overrides: Parameters<typeof makeUnit>[1] = {}) {
  const u = makeUnit(id, overrides) as any;
  u.deathRecords = [{ timestamp: deathTimestampMs, event: LogEvent.UNIT_DIED, parameters: [] }];
  return u;
}

function makeCCSummary(playerName: string, ccInstances: any[] = []) {
  return {
    playerName,
    playerSpec: 'Paladin Holy',
    trinketType: 'Gladiator',
    trinketCooldownSeconds: 90,
    ccInstances,
    trinketUseTimes: [],
    missedTrinketWindows: [],
  };
}

describe('buildDeathOutcomeSummary — immunity checks', () => {
  it('returns empty events when no friendly deaths occurred', () => {
    const alive = makeUnit('p1', { spec: CombatUnitSpec.Paladin_Holy });
    const result = buildDeathOutcomeSummary(makeCombat() as any, [alive], [makeCCSummary('p1')]);
    expect(result.events).toHaveLength(0);
  });

  it('flags Divine Shield available at death when never used', () => {
    const dead = makeDeadUnit('p1', MATCH_START + 60_000, { spec: CombatUnitSpec.Paladin_Holy });
    const result = buildDeathOutcomeSummary(makeCombat() as any, [dead], [makeCCSummary('p1')]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].availableImmunities).toHaveLength(1);
    expect(result.events[0].availableImmunities[0].spellName).toBe('Divine Shield');
    expect(result.events[0].availableImmunities[0].wasInCC).toBe(false);
  });

  it('does NOT flag Divine Shield when it was used recently (still on CD)', () => {
    const dead = makeDeadUnit('p1', MATCH_START + 60_000, {
      spec: CombatUnitSpec.Paladin_Holy,
      spellCastEvents: [makeSpellCastEvent('642', MATCH_START + 10_000, 'p1', 'Self', 'p1', 'Paladin')],
    });
    const result = buildDeathOutcomeSummary(makeCombat() as any, [dead], [makeCCSummary('p1')]);
    expect(result.events[0]?.availableImmunities ?? []).toHaveLength(0);
  });

  it('flags wasInCC=true when CC was active at death and no trinket available', () => {
    const dead = makeDeadUnit('p1', MATCH_START + 60_000, { spec: CombatUnitSpec.Paladin_Holy });
    const ccSummary = makeCCSummary('p1', [
      {
        atSeconds: 55,
        durationSeconds: 10,
        spellId: '408',
        spellName: 'Kidney Shot',
        sourceName: 'Rogue',
        sourceSpec: 'Rogue Subtlety',
        trinketState: 'on_cooldown',
        trinketCooldownSecondsRemaining: null,
        drInfo: null,
        damageTakenDuring: 0,
        distanceYards: null,
        losBlocked: null,
      },
    ]);
    const result = buildDeathOutcomeSummary(makeCombat() as any, [dead], [ccSummary]);
    expect(result.events[0].availableImmunities[0].wasInCC).toBe(true);
  });

  it('excludes Divine Shield when Forbearance (25771) lockout aura is active at death', () => {
    const dead = makeDeadUnit('p1', MATCH_START + 30_000, {
      spec: CombatUnitSpec.Paladin_Holy,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '25771', MATCH_START + 10_000, 'p1', 'p1', 'DEBUFF'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '25771', MATCH_START + 40_000, 'p1', 'p1', 'DEBUFF'),
      ],
    });
    const result = buildDeathOutcomeSummary(makeCombat() as any, [dead], [makeCCSummary('p1')]);
    const immunities = result.events[0]?.availableImmunities ?? [];
    expect(immunities.find((i: any) => i.spellName === 'Divine Shield')).toBeUndefined();
  });

  it('flags wasInCC=true when CC active and trinket was available_unused (chose not to trinket)', () => {
    const dead = makeDeadUnit('p1', MATCH_START + 60_000, { spec: CombatUnitSpec.Paladin_Holy });
    const ccSummary = makeCCSummary('p1', [
      {
        atSeconds: 55,
        durationSeconds: 10,
        spellId: '408',
        spellName: 'Kidney Shot',
        sourceName: 'Rogue',
        sourceSpec: 'Rogue Subtlety',
        trinketState: 'available_unused',
        trinketCooldownSecondsRemaining: null,
        drInfo: null,
        damageTakenDuring: 0,
        distanceYards: null,
        losBlocked: null,
      },
    ]);
    const result = buildDeathOutcomeSummary(makeCombat() as any, [dead], [ccSummary]);
    expect(result.events[0].availableImmunities[0].wasInCC).toBe(true);
  });

  it('skips a death event with no available immunities and no missed externals', () => {
    const dead = makeDeadUnit('p1', MATCH_START + 60_000, {
      spec: CombatUnitSpec.Mage_Frost,
      spellCastEvents: [makeSpellCastEvent('45438', MATCH_START + 10_000, 'p1', 'Self', 'p1', 'Mage')],
    });
    const result = buildDeathOutcomeSummary(makeCombat() as any, [dead], [makeCCSummary('p1')]);
    expect(result.events).toHaveLength(0);
  });
});

describe('buildDeathOutcomeSummary — external defensive checks', () => {
  it('flags missed Ironbark when Druid was free and had it available', () => {
    const warrior = makeDeadUnit('w1', MATCH_START + 90_000, {
      spec: CombatUnitSpec.Warrior_Arms,
      name: 'Warrior',
    });
    const druid = makeUnit('d1', {
      spec: CombatUnitSpec.Druid_Restoration,
      name: 'Druid',
    });
    const result = buildDeathOutcomeSummary(
      makeCombat() as any,
      [warrior, druid],
      [makeCCSummary('Warrior'), makeCCSummary('Druid')],
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0].missedExternals).toHaveLength(1);
    expect(result.events[0].missedExternals[0].spellName).toBe('Ironbark');
    expect(result.events[0].missedExternals[0].casterWasInCC).toBe(false);
  });

  it('flags casterWasInCC=true when external caster was in hard CC at death time', () => {
    const warrior = makeDeadUnit('w1', MATCH_START + 90_000, {
      spec: CombatUnitSpec.Warrior_Arms,
      name: 'Warrior',
    });
    const druid = makeUnit('d1', { spec: CombatUnitSpec.Druid_Restoration, name: 'Druid' });
    const druidCC = makeCCSummary('Druid', [
      {
        atSeconds: 85,
        durationSeconds: 10,
        spellId: '605',
        spellName: 'Mind Control',
        sourceName: 'Priest',
        sourceSpec: 'Priest Shadow',
        trinketState: 'on_cooldown',
        trinketCooldownSecondsRemaining: null,
        drInfo: null,
        damageTakenDuring: 0,
        distanceYards: null,
        losBlocked: null,
      },
    ]);
    const result = buildDeathOutcomeSummary(makeCombat() as any, [warrior, druid], [makeCCSummary('Warrior'), druidCC]);
    expect(result.events[0].missedExternals[0].casterWasInCC).toBe(true);
  });

  it('flags missed external when teammate cast the spell this match (not spec baseline)', () => {
    // A Paladin Holy casts Ironbark (which is not their baseline) — proves cross-spec cast-history path
    const warrior = makeDeadUnit('w1', MATCH_START + 90_000, {
      spec: CombatUnitSpec.Warrior_Arms,
      name: 'Warrior',
    });
    const paladin = makeUnit('d1', {
      spec: CombatUnitSpec.Paladin_Holy,
      name: 'Paladin',
      // Paladin cast Ironbark (102342) once this match via some talent/trinket scenario
      spellCastEvents: [makeSpellCastEvent('102342', MATCH_START + 10_000, 'w1', 'Warrior', 'd1', 'Paladin')],
    });
    const result = buildDeathOutcomeSummary(
      makeCombat() as any,
      [warrior, paladin],
      [makeCCSummary('Warrior'), makeCCSummary('Paladin')],
    );
    // Ironbark was cast at t=10s (CD=45s), ready again at t=55s, warrior dies at t=90s → flagged
    expect(result.events[0].missedExternals.find((e: any) => e.spellName === 'Ironbark')).toBeDefined();
  });

  it('does NOT flag Ironbark when it was recently used (still on CD)', () => {
    const warrior = makeDeadUnit('w1', MATCH_START + 90_000, {
      spec: CombatUnitSpec.Warrior_Arms,
      name: 'Warrior',
    });
    const druid = makeUnit('d1', {
      spec: CombatUnitSpec.Druid_Restoration,
      name: 'Druid',
      spellCastEvents: [makeSpellCastEvent('102342', MATCH_START + 80_000, 'w1', 'Warrior', 'd1', 'Druid')],
    });
    const result = buildDeathOutcomeSummary(
      makeCombat() as any,
      [warrior, druid],
      [makeCCSummary('Warrior'), makeCCSummary('Druid')],
    );
    expect(result.events[0]?.missedExternals ?? []).toHaveLength(0);
  });
});
