/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatExtraSpellAction, CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

import { reconstructDispelSummary } from '../dispelAnalysis';
import { makeAuraEvent, makeUnit } from './testHelpers';

const COMBAT = { startTime: 0, endTime: 60_000 };

describe('reconstructDispelSummary — B11 stolen-buff false positive', () => {
  it('does NOT flag a missed cleanse when a friendly Mage spellsteals an enemy Blessing of Freedom', () => {
    const friendlyMage = makeUnit('mage-1', {
      name: 'FriendlyMage',
      spec: CombatUnitSpec.Mage_Frost,
      auraEvents: [
        // Stolen buff lands on friendly Mage at t=5s, srcUnit is the original enemy Paladin.
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '1044', 5_000, 'enemy-pal', 'mage-1', 'BUFF'),
        // Buff expires naturally at t=20s — 15s duration, well past the 3s missed-cleanse threshold.
        // Without the auraType filter the missed-cleanse loop would treat this as a missed Magic cleanse.
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '1044', 20_000, 'enemy-pal', 'mage-1', 'BUFF'),
      ],
    });
    const friendlyHealer = makeUnit('priest-1', {
      name: 'FriendlyHealer',
      spec: CombatUnitSpec.Priest_Holy,
    });
    const enemyPaladin = makeUnit('enemy-pal', {
      name: 'EnemyPaladin',
      spec: CombatUnitSpec.Paladin_Retribution,
    });

    const summary = reconstructDispelSummary([friendlyMage, friendlyHealer], [enemyPaladin], COMBAT);

    expect(summary.missedCleanseWindows).toHaveLength(0);
    const totalCC = summary.ccEfficiency.reduce((s, e) => s + e.totalCCWindows, 0);
    expect(totalCC).toBe(0);
  });

  it('still flags a missed cleanse for a real enemy debuff (Polymorph on friendly, never removed within threshold)', () => {
    const friendlyDps = makeUnit('rogue-1', {
      name: 'FriendlyRogue',
      spec: CombatUnitSpec.Rogue_Assassination,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '118', 5_000, 'enemy-mage', 'rogue-1', 'DEBUFF'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '118', 13_000, 'enemy-mage', 'rogue-1', 'DEBUFF'),
      ],
    });
    const friendlyHealer = makeUnit('priest-1', {
      name: 'FriendlyHealer',
      spec: CombatUnitSpec.Priest_Holy,
    });
    const enemyMage = makeUnit('enemy-mage', {
      name: 'EnemyMage',
      spec: CombatUnitSpec.Mage_Frost,
    });

    const summary = reconstructDispelSummary([friendlyDps, friendlyHealer], [enemyMage], COMBAT);

    expect(summary.missedCleanseWindows).toHaveLength(1);
    expect(summary.missedCleanseWindows[0].spellId).toBe('118');
  });
});

describe('reconstructDispelSummary — F94 pet dispel tagging', () => {
  function makeRealDispelAction(
    timestamp: number,
    srcUnitId: string,
    destUnitId: string,
    dispelSpellId: string,
    removedSpellId: string,
    removedSpellName: string,
  ): CombatExtraSpellAction {
    const logLine = {
      id: '0',
      timestamp,
      timezone: 'UTC',
      event: LogEvent.SPELL_DISPEL,
      parameters: [
        srcUnitId, // 0: srcUnitId
        '"Source"', // 1: srcUnitName
        0x511, // 2: srcUnitFlags (player friendly)
        0, // 3: srcRaidFlags
        destUnitId, // 4: destUnitId
        '"Target"', // 5: destUnitName
        0x511, // 6: destUnitFlags
        0, // 7: destRaidFlags
        dispelSpellId, // 8: spellId
        `"${dispelSpellId}"`, // 9: spellName
        'MAGIC', // 10: spellSchool
        removedSpellId, // 11: extraSpellId
        `"${removedSpellName}"`, // 12: extraSpellName
        'MAGIC', // 13: extraSpellSchool
        'DEBUFF', // 14: auraType
      ],
      raw: '',
    };
    return new CombatExtraSpellAction(logLine as any);
  }

  it('sets isPetDispel=false when player directly dispels an ally', () => {
    const healer = makeUnit('healer-1', {
      name: 'Healer',
      spec: CombatUnitSpec.Priest_Holy,
      actionOut: [makeRealDispelAction(5_000, 'healer-1', 'ally-1', '527', '118', 'Polymorph')] as any[],
    });
    const ally = makeUnit('ally-1', { name: 'Ally', spec: CombatUnitSpec.Rogue_Assassination });
    const enemy = makeUnit('enemy-1', {
      name: 'Enemy',
      spec: CombatUnitSpec.Mage_Frost,
      reaction: 0 as any, // CombatUnitReaction.Hostile
    });

    const summary = reconstructDispelSummary([healer, ally], [enemy], { startTime: 0, endTime: 60_000 });

    expect(summary.allyCleanse).toHaveLength(1);
    expect(summary.allyCleanse[0].isPetDispel).toBe(false);
    expect(summary.allyCleanse[0].sourceName).toBe('Healer');
  });

  it('sets isPetDispel=true when a pet dispel action is merged into a player unit (srcUnitId !== unit.id)', () => {
    // The Warlock player unit has a pet's dispel action merged into their actionOut.
    // The pet's ID ('felhunter-1') differs from the player's ID ('warlock-1').
    const warlock = makeUnit('warlock-1', {
      name: 'Warlock',
      spec: CombatUnitSpec.Warlock_Affliction,
      actionOut: [makeRealDispelAction(8_000, 'felhunter-1', 'ally-1', '19505', '118', 'Polymorph')] as any[],
    });
    const ally = makeUnit('ally-1', { name: 'Ally', spec: CombatUnitSpec.Rogue_Assassination });
    const enemy = makeUnit('enemy-1', {
      name: 'Enemy',
      spec: CombatUnitSpec.Mage_Frost,
      reaction: 0 as any,
    });

    const summary = reconstructDispelSummary([warlock, ally], [enemy], { startTime: 0, endTime: 60_000 });

    expect(summary.allyCleanse).toHaveLength(1);
    expect(summary.allyCleanse[0].isPetDispel).toBe(true);
    expect(summary.allyCleanse[0].sourceName).toBe('Warlock');
  });
});
