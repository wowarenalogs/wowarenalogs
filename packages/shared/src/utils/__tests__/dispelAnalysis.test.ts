import { CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

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
