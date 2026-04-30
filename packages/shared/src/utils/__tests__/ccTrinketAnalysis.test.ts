/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitSpec } from '@wowarenalogs/parser';

import { detectTrinketType } from '../ccTrinketAnalysis';
import { makeUnit } from './testHelpers';

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
