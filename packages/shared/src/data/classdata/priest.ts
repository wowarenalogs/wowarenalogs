import { CombatUnitSpec } from 'wow-combat-log-parser';

import { SpecInfo, unitHasPvpTalent } from '../spell';

export const priest: SpecInfo[] = [
  {
    specialization: CombatUnitSpec.Priest_Holy,
    awcSpellIds: ['123', '456'],
    talentMods: [
      {
        // 'Blessed Hands'
        predicate: (unit) => unitHasPvpTalent(unit, '199454'),
        morphInPlace: (spells) => {
          const s = spells.find((s) => s.id === '1022');
          if (s?.charges?.max) {
            s.charges.max = 2;
          }
          return spells;
        },
      },
    ],
  },
];
