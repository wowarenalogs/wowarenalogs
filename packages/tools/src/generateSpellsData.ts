/* eslint-disable */
import fs from 'fs-extra';
import path from 'path';

import spellDBInfo from '../../../../pvp-tooltips-addon/spellDataParsed.json';
import spellEffects from '../../shared/src/data/spellEffects.json';
import spellTags from '../../shared/src/data/spells.json';

//spellTags
// "66": {
//   "type": "buffs_offensive"
// },
// "99": {
//   "type": "cc"
// },
// "118": {
//   "type": "cc"
// },
// "122": {
//   "type": "roots"
// },
// "130": {
//   "type": "buffs_other"
// },

// spellDB
// type SpellInfo = {
//   spellId: number;
//   name: string;
//   pvpModifiers: PvPModifier[];
//   /**
//    * Spells that directly (1-hop) trigger this spell; DB entry
//    */
//   triggeredBy: number[];
//   /**
//    * Spells that directly (1-hop) affect this spell; DB entry
//    */
//   affectedBy: number[];
//   /**
//    * All spells that this spell triggers; computed
//    */
//   triggerChain: number[];
//   /**
//    * All spells that affect this spell; computed
//    */
//   azeritePowerId: string;
//   affectedByChain: number[];
//   pvpModifiersFromTriggers: PvPModifier[];
//   pvpModifiersFromAffectors: PvPModifier[];

//   duration: number | null;
//   cooldown: number | null;
//   charges: number | null;
//   chargesCooldown: number | null;
//   gcd: number | null;
// };

// spellEffects
// "66": {
//   "spellId": "66",
//   "name": "Invisibility",
//   "cooldownSeconds": 300,
//   "charges": {},
//   "durationSeconds": 3
// },
// "88625": {
//   "spellId": "88625",
//   "name": "Holy Word: Chastise",
//   "cooldownSeconds": 60,
//   "charges": {},
//   "durationSeconds": 4
// },
//
// "charges": {
//   "charges": 1,
//   "chargeCooldownSeconds": 30
// },
// "durationSeconds": 15

async function main() {
  console.log('Comparing SL->DF effects data');
  Object.keys(spellEffects).forEach((k) => {
    const e = (spellEffects as any)[k];
    const spellDbEntry = (spellDBInfo as any).find((s: any) => s.spellId.toString() === e.spellId);

    if (!spellDbEntry) {
      console.log(`No entry for ${e.spellId} in DB?`);
      return;
    }

    if (spellDbEntry.cooldown !== null && spellDbEntry.cooldown !== e.cooldownSeconds) {
      console.log(`spell ${e.spellId} changed cooldown. ${e.cooldownSeconds} => ${spellDbEntry.cooldown}`);
      e.cooldownSeconds = spellDbEntry.cooldown;
    }

    if (
      (spellDbEntry.charges !== null || Object.keys(e.charges).length !== 0) &&
      spellDbEntry.charges !== e.charges?.charges
    ) {
      console.log(`spell ${e.spellId} changed charges. ${e.charges?.charges} => ${spellDbEntry.charges}`);
      e.charges = { charges: spellDbEntry.charges, chargeCooldownSeconds: spellDbEntry.chargesCooldown };
    }

    if (
      (spellDbEntry.charges !== null || Object.keys(e.charges).length !== 0) &&
      spellDbEntry.chargesCooldown !== e.charges?.chargesCooldownSeconds
    ) {
      console.log(
        `spell ${e.spellId} changed chargesCooldown. ${e.charges?.chargesCooldown} => ${spellDbEntry.chargesCooldown}`,
      );
      e.charges = { charges: spellDbEntry.charges, chargeCooldownSeconds: spellDbEntry.chargesCooldown };
    }
  });

  console.log('Writing updated spell effects data');
  const outputPath = path.resolve(__dirname, '../../shared/src/data/spellEffects.json');
  await fs.writeFile(outputPath, JSON.stringify(spellEffects, null, 2));

  console.log('Resolving spell info from tags dump');
  Object.keys(spellTags).forEach((spellId) => {
    const spellDbEntry = (spellDBInfo as any).find((s: any) => s.spellId.toString() === spellId);

    if (!spellDbEntry) {
      console.log(`No entry for ${spellId} in DB?`);
      return;
    }
  });
}

main();

/* eslint-enable */
