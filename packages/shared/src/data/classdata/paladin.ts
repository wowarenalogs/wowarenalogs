import { CombatUnitSpec } from 'wow-combat-log-parser';

import { SpecInfo, unitHasPvpTalent } from '../spell';

export const paladin: SpecInfo[] = [
  {
    /**
     * The specialization this block represents
     */
    specialization: CombatUnitSpec.Paladin_Holy,

    /**
     * awcSpellIds contains a list of ids of spells that will appear next to the unit frame
     * in the replay view. These are generally important cooldowns for the specialization.
     *
     * Note that currently if a spell is not cast during the match it will not show up next
     * to the unit frame.
     */
    awcSpellIds: ['123', '456'],

    /**
     * talentMods is a list of changes that need to be applied to a player's spells due to
     * talents/pvptalents they have selected for this individual match.
     */
    talentMods: [
      {
        // 'Blessed Hands'
        // Predicate is what decides if a unit needs this change applied
        // ie: Do they have a Talent / PvP Talent that causes a spell to change?
        predicate: (unit) => unitHasPvpTalent(unit, '199454'),

        // morphInPlace applies changes to their spells
        morphInPlace: (spells) => {
          // Look up a spell/spells that this talent changes
          const s = spells.find((s) => s.id === '1022');

          // Apply changes directly to the object(s)
          if (s?.charges?.max) {
            s.charges.max = 2;
          }

          // Return the entire array back
          return spells;
        },
      },
    ],
  },
];
