/* eslint-disable */
import fs from 'fs-extra';
import path from 'path';

import spellCDsDump from '../../../../simc/dbc_extract3/SpellCooldowns.json';
import spellNamesDump from '../../../../simc/dbc_extract3/SpellName.json';
import spellDurationsDump from '../../../../simc/dbc_extract3/SpellDuration.json';
import spellCategoryDataDump from '../../../../simc/dbc_extract3/SpellCategory.json';
import spellCategoriesDump from '../../../../simc/dbc_extract3/SpellCategories.json';
import spellMiscInfoDump from '../../../../simc/dbc_extract3/SpellMisc.json';

import { awcSpells } from '../../shared/src/data/awcSpells';
import taggedSpellsDump from '../../shared/src/data/spells.json';
import _ from 'lodash';

const awcSpellIds = Object.values(awcSpells).flat();
const taggedSpellIds = Object.keys(taggedSpellsDump);

const spellCategory = spellCategoryDataDump as {
  id: number;
  category: string;
  unk_1: number;
  unk_2: number;
  charges: number;
  charge_cooldown: number;
  unk_3: number;
}[];
const spellCategories = spellCategoriesDump as {
  id: number;
  unk_1: number;
  id_cooldown_category: number;
  dmg_class: number;
  dispel: number;
  id_mechanic: number;
  type_prevention: number;
  start_recovery_category: number;
  id_charge_category: number;
  id_parent: number;
}[];
const spellNames = spellNamesDump as { id: number; name: string }[];
const spellCDs = spellCDsDump as {
  id: number;
  unk_1: number;
  category_cooldown: number;
  gcd_cooldown: number;
  cooldown: number;
  id_buff_spell: number;
  id_parent: number;
}[];
const spellDurations = spellDurationsDump as { id: number; duration_1: number; duration_2: number }[];
const spellMiscInfo = spellMiscInfoDump as {
  id: number;
  flags_1: number;
  flags_2: number;
  flags_3: number;
  flags_4: number;
  flags_5: number;
  flags_6: number;
  flags_7: number;
  flags_8: number;
  flags_9: number;
  flags_10: number;
  flags_11: number;
  flags_12: number;
  flags_13: number;
  flags_14: number;
  flags_15: number;
  unk_2: number;
  id_cast_time: number;
  id_duration: number;
  id_range: number;
  school: number;
  proj_speed: number;
  proj_delay: number;
  proj_min_duration: number;
  id_icon: number;
  id_active_icon: number;
  unk_4: number;
  unk_901_1: number;
  unk_901_2: number;
  unk_901_3: number;
  id_parent: number;
}[];

interface ISpellDbEntry {
  spellId: string;
  name: string;
  charges?: {
    charges: number;
    chargeCooldownSeconds: number;
  };
  durationSeconds: number;
  cooldownSeconds: number;
}

const newEffectsLibrary: Record<string, ISpellDbEntry> = {};

const spellIds = _.uniq([...taggedSpellIds, ...awcSpellIds]);

function findName(id: number): string {
  const maybeMatch = spellNames.find((i) => i.id === id);
  return maybeMatch?.name ?? 'NAME_NOT_FOUND';
}

function findCooldown(id: number): number {
  const maybeMatch = spellCDs.find((i) => i.id_parent === id);
  return (maybeMatch?.cooldown ?? 999999) / 1000;
}

function findDuration(id: number): number {
  const matchMiscInfo = spellMiscInfo.find((i) => i.id_parent === id);
  if (!matchMiscInfo) return 0;

  const maybeMatch = spellDurations.find((i) => i.id === matchMiscInfo.id_duration);
  return (maybeMatch?.duration_1 ?? 0) / 1000; // if spell has no duration (is instant) this field will just not be in the array
}

function findCharges(id: number) {
  const spellCategoryInfo = spellCategories.find((i) => i.id_parent === id);
  if (!spellCategoryInfo) return;

  const categoryInfo = spellCategory.find((i) => i.id === spellCategoryInfo.id_charge_category);

  return categoryInfo?.charges
    ? { charges: categoryInfo?.charges, chargeCooldownSeconds: categoryInfo.charge_cooldown / 1000 }
    : undefined;
}

console.log(spellNames[0]);

async function main() {
  console.log('Comparing SL->DF effects data');
  spellIds.forEach((spellId) => {
    console.log(spellId);

    const spellIdInt = parseInt(spellId);
    newEffectsLibrary[spellId] = {
      spellId: spellId,
      name: findName(spellIdInt),
      cooldownSeconds: findCooldown(spellIdInt),
      charges: findCharges(spellIdInt),
      durationSeconds: findDuration(spellIdInt),
    };
  });

  console.log('Writing updated spell effects data');
  const outputPath = path.resolve(__dirname, '../../shared/src/data/spellEffects.json');
  await fs.writeFile(outputPath, JSON.stringify(newEffectsLibrary, null, 2));
}

main();

/* eslint-enable */
