/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitReaction, CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

import { analyzePlayerCCAndTrinket, detectTrinketType } from '../ccTrinketAnalysis';
import { makeAuraEvent, makeInterruptEvent, makeUnit } from './testHelpers';

// Mock the generated JSON so tests never depend on real item IDs.
jest.mock('../../data/trinketItemIds.json', () => ({
  adaptationItemIds: ['TEST_ADAPT_1', '181816'],
  relentlessItemIds: ['TEST_RELENTLESS_1', '181335'],
}));

// Builds an ICombatUnit with specific item IDs at trinket slots (indices 12 and 13).
function unitWithTrinket(slot12Id: string | null, slot13Id: string | null = null) {
  const equipment: any[] = [];
  if (slot12Id) equipment[12] = { id: slot12Id, ilvl: 450, enchants: [], bonuses: [], gems: [] };
  if (slot13Id) equipment[13] = { id: slot13Id, ilvl: 450, enchants: [], bonuses: [], gems: [] };
  return makeUnit('p1', {
    spec: CombatUnitSpec.Paladin_Holy,
    info: { equipment } as any,
  });
}

describe('detectTrinketType', () => {
  it('returns Adaptation when slot 12 matches an Adaptation item ID', () => {
    expect(detectTrinketType(unitWithTrinket('TEST_ADAPT_1'))).toBe('Adaptation');
  });

  it('returns Adaptation for legacy ID 181816 still present in JSON', () => {
    expect(detectTrinketType(unitWithTrinket('181816'))).toBe('Adaptation');
  });

  it('returns Relentless when slot 12 matches a Relentless item ID', () => {
    expect(detectTrinketType(unitWithTrinket('TEST_RELENTLESS_1'))).toBe('Relentless');
  });

  it('returns Relentless for legacy ID 181335 still present in JSON', () => {
    expect(detectTrinketType(unitWithTrinket('181335'))).toBe('Relentless');
  });

  it('returns Gladiator when equipment is present but ID is not in either set', () => {
    expect(detectTrinketType(unitWithTrinket('99999'))).toBe('Gladiator');
  });

  it('returns Unknown when unit has no equipment info', () => {
    const unit = makeUnit('p1', { spec: CombatUnitSpec.Paladin_Holy, info: undefined });
    expect(detectTrinketType(unit)).toBe('Unknown');
  });

  it('returns Unknown when equipment array is empty', () => {
    const unit = makeUnit('p1', {
      spec: CombatUnitSpec.Paladin_Holy,
      info: { equipment: [] } as any,
    });
    expect(detectTrinketType(unit)).toBe('Unknown');
  });

  it('checks slot 13 as well as slot 12', () => {
    expect(detectTrinketType(unitWithTrinket(null, 'TEST_ADAPT_1'))).toBe('Adaptation');
  });

  it('Relentless check takes precedence over Adaptation (first match wins)', () => {
    // Relentless check runs first in detectTrinketType
    expect(detectTrinketType(unitWithTrinket('TEST_RELENTLESS_1', 'TEST_ADAPT_1'))).toBe('Relentless');
  });
});

describe('analyzePlayerCCAndTrinket — root/disarm/interrupt tracking', () => {
  const MATCH_START = 1_000_000;
  const MATCH_END = 1_300_000;

  function makeCombat() {
    return { startTime: MATCH_START, endTime: MATCH_END, startInfo: { zoneId: '1672' } };
  }

  function makeEnemy(id: string, name: string) {
    return makeUnit(id, {
      name,
      reaction: CombatUnitReaction.Hostile,
      spec: CombatUnitSpec.Rogue_Subtlety,
    });
  }

  it('tracks a root applied by an enemy', () => {
    // Entangling Roots = spellId '339'
    const apply = makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '339', MATCH_START + 5_000, 'enemy-1', 'player-1');
    const removed = makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '339', MATCH_START + 8_000, 'enemy-1', 'player-1');
    const player = makeUnit('player-1', { auraEvents: [apply, removed] });
    const enemy = makeEnemy('enemy-1', 'EnemyA');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.rootInstances).toHaveLength(1);
    expect(result.rootInstances[0].spellId).toBe('339');
    expect(result.rootInstances[0].durationSeconds).toBeCloseTo(3);
    expect(result.rootInstances[0].atSeconds).toBeCloseTo(5);
  });

  it('does not track roots from friendly sources', () => {
    const apply = makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '339', MATCH_START + 5_000, 'friend-1', 'player-1');
    const player = makeUnit('player-1', { auraEvents: [apply] });
    const enemy = makeEnemy('enemy-1', 'EnemyA');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.rootInstances).toHaveLength(0);
  });

  it('tracks a disarm applied by an enemy', () => {
    // Disarm (Warrior) = spellId '236077'
    const apply = makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '236077', MATCH_START + 10_000, 'enemy-1', 'player-1');
    const removed = makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '236077', MATCH_START + 15_000, 'enemy-1', 'player-1');
    const player = makeUnit('player-1', { auraEvents: [apply, removed] });
    const enemy = makeEnemy('enemy-1', 'EnemyA');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.disarmInstances).toHaveLength(1);
    expect(result.disarmInstances[0].spellId).toBe('236077');
    expect(result.disarmInstances[0].durationSeconds).toBeCloseTo(5);
  });

  it('tracks a kick from an enemy (SPELL_INTERRUPT)', () => {
    // Kick (Rogue) = extraSpellId '1766', lockout 5s; interrupted = Frost Bolt
    const kick = makeInterruptEvent('1766', 'Kick', '116', 'Frostbolt', MATCH_START + 20_000, 'enemy-1', 'EnemyA');
    const player = makeUnit('player-1', { actionIn: [kick] });
    const enemy = makeEnemy('enemy-1', 'EnemyA');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.interruptInstances).toHaveLength(1);
    expect(result.interruptInstances[0].kickSpellId).toBe('1766');
    expect(result.interruptInstances[0].kickSpellName).toBe('Kick');
    expect(result.interruptInstances[0].interruptedSpellName).toBe('Frostbolt');
    expect(result.interruptInstances[0].lockoutDurationSeconds).toBe(5);
    expect(result.interruptInstances[0].atSeconds).toBeCloseTo(20);
  });

  it('uses a 3s default lockout for unknown interrupt spells', () => {
    // Unknown spell ID '99999999' — not in spells.json
    const kick = makeInterruptEvent('99999999', 'UnknownKick', '116', 'Frostbolt', MATCH_START + 5_000);
    const player = makeUnit('player-1', { actionIn: [kick] });
    const enemy = makeEnemy('enemy-1', 'EnemyA');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.interruptInstances[0].lockoutDurationSeconds).toBe(3);
  });

  it('does not track kicks from friendly sources', () => {
    const kick = makeInterruptEvent('1766', 'Kick', '116', 'Frostbolt', MATCH_START + 5_000, 'friend-1', 'Friend');
    const player = makeUnit('player-1', { actionIn: [kick] });
    const enemy = makeEnemy('enemy-1', 'EnemyA');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.interruptInstances).toHaveLength(0);
  });
});

describe('analyzePlayerCCAndTrinket — trinketCDSecondsLeft', () => {
  const MATCH_START = 1_000_000;
  const MATCH_END = 1_300_000;

  // CC spell that is tracked: Hammer of Justice (853) is in ccSpellIds
  const HOJ_SPELL_ID = '853';

  function makeCombat() {
    return { startTime: MATCH_START, endTime: MATCH_END, startInfo: { zoneId: '1672' } };
  }

  function makeEnemy(id: string) {
    return makeUnit(id, {
      name: 'Enemy',
      reaction: CombatUnitReaction.Hostile,
      spec: CombatUnitSpec.Paladin_Retribution,
    });
  }

  it('sets trinketCDSecondsLeft when trinket is on cooldown', () => {
    // Gladiator Medallion (spell 336126) cast at T+10s. CD is 90s (healer).
    // CC lands at T+40s → trinket has been on CD for 30s → 60s left.
    const trinketCast = {
      logLine: { event: LogEvent.SPELL_CAST_SUCCESS, timestamp: MATCH_START + 10_000, parameters: [] },
      spellId: '336126',
      spellName: "Gladiator's Medallion",
      srcUnitId: 'player-1',
      srcUnitName: 'Player',
      destUnitId: 'player-1',
      destUnitName: 'Player',
      effectiveAmount: 0,
      advancedActorMaxHp: 0,
      advancedActorCurrentHp: 0,
      advancedActorPositionX: 0,
      advancedActorPositionY: 0,
    };
    const ccApply = makeAuraEvent(
      LogEvent.SPELL_AURA_APPLIED,
      HOJ_SPELL_ID,
      MATCH_START + 40_000,
      'enemy-1',
      'player-1',
    );
    const ccRemove = makeAuraEvent(
      LogEvent.SPELL_AURA_REMOVED,
      HOJ_SPELL_ID,
      MATCH_START + 44_000,
      'enemy-1',
      'player-1',
    );

    const player = makeUnit('player-1', {
      spec: CombatUnitSpec.Paladin_Holy, // healer → 90s CD
      info: { equipment: [{ id: '99999', ilvl: 450, enchants: [], bonuses: [], gems: [] }] } as any,
      spellCastEvents: [trinketCast] as any,
      auraEvents: [ccApply, ccRemove],
    });
    const enemy = makeEnemy('enemy-1');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.ccInstances).toHaveLength(1);
    expect(result.ccInstances[0].trinketState).toBe('on_cooldown');
    expect(result.ccInstances[0].trinketCDSecondsLeft).toBe(60);
  });

  it('does not set trinketCDSecondsLeft when trinket is available_unused', () => {
    // No prior trinket cast → available
    const ccApply = makeAuraEvent(
      LogEvent.SPELL_AURA_APPLIED,
      HOJ_SPELL_ID,
      MATCH_START + 40_000,
      'enemy-1',
      'player-1',
    );
    const ccRemove = makeAuraEvent(
      LogEvent.SPELL_AURA_REMOVED,
      HOJ_SPELL_ID,
      MATCH_START + 44_000,
      'enemy-1',
      'player-1',
    );

    const player = makeUnit('player-1', {
      spec: CombatUnitSpec.Paladin_Holy,
      info: { equipment: [{ id: '99999', ilvl: 450, enchants: [], bonuses: [], gems: [] }] } as any,
      spellCastEvents: [],
      auraEvents: [ccApply, ccRemove],
    });
    const enemy = makeEnemy('enemy-1');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.ccInstances[0].trinketState).toBe('available_unused');
    expect(result.ccInstances[0].trinketCDSecondsLeft).toBeUndefined();
  });
});
