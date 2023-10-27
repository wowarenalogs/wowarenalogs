/* eslint-disable no-console */
import fs, { readJSON } from 'fs-extra';
import _ from 'lodash';
import path, { resolve } from 'path';

import { awcSpells } from '../../shared/src/data/awcSpells';
import taggedSpellsDump from '../../shared/src/data/spells.json';

const awcSpellIds = Object.values(awcSpells).flat();
const taggedSpellIds = Object.keys(taggedSpellsDump);

let spellCategory: {
  id: number;
  category: string;
  unk_1: number;
  unk_2: number;
  charges: number;
  charge_cooldown: number;
  unk_3: number;
}[] = [];
let spellCategories: {
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
}[] = [];
let spellNames: { id: number; name: string }[] = [];
let spellCDs: {
  id: number;
  unk_1: number;
  category_cooldown: number;
  gcd_cooldown: number;
  cooldown: number;
  id_buff_spell: number;
  id_parent: number;
}[] = [];
let spellDurations: { id: number; duration_1: number; duration_2: number }[] = [];
let spellMiscInfo: {
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
}[] = [];

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

async function loadFiles() {
  spellCDs = await readJSON(resolve(__dirname, '../../../../simc/dbc_extract3/SpellCooldowns.json'));
  spellCategory = await readJSON(resolve(__dirname, '../../../../simc/dbc_extract3/SpellCategory.json'));
  spellCategories = await readJSON(resolve(__dirname, '../../../../simc/dbc_extract3/SpellCategories.json'));
  spellNames = await readJSON(resolve(__dirname, '../../../../simc/dbc_extract3/SpellName.json'));
  spellDurations = await readJSON(resolve(__dirname, '../../../../simc/dbc_extract3/SpellDuration.json'));
  spellMiscInfo = await readJSON(resolve(__dirname, '../../../../simc/dbc_extract3/SpellMisc.json'));
}

const newEffectsLibrary: Record<string, ISpellDbEntry> = {};

const spellIds = _.uniq([...taggedSpellIds, ...awcSpellIds]);

function findName(id: number): string {
  const maybeMatch = spellNames.find((i) => i.id === id);
  // Every spell id with a missing name must be accounted for!
  if (!maybeMatch) {
    console.log(`MISSING NAME ${id}`);
  }
  return maybeMatch?.name ?? 'NAME_NOT_FOUND';
}

function findCooldown(id: number): number {
  const maybeMatch = spellCDs.find((i) => i.id_parent === id);
  // Missing cooldown info is mostly OK.. we have spell effects that have no cd (garrote silence) that we want
  // to track some info about
  // if (!maybeMatch) {
  //   console.log(`Missing cooldown ${id}`);
  // }
  return ((maybeMatch?.cooldown || maybeMatch?.category_cooldown) ?? 999999) / 1000;
}

function findDuration(id: number): number {
  const matchMiscInfo = spellMiscInfo.find((i) => i.id_parent === id);
  if (!matchMiscInfo) {
    console.log(`Missing duration ${id}`);
    return 0;
  }

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

async function main() {
  console.log('Loading data files');
  await loadFiles();

  console.log('Parsing spells');
  spellIds.forEach((spellId) => {
    const spellIdInt = parseInt(spellId);
    newEffectsLibrary[spellId] = {
      spellId: spellId,
      name: findName(spellIdInt),
      cooldownSeconds: findCooldown(spellIdInt),
      charges: findCharges(spellIdInt),
      durationSeconds: findDuration(spellIdInt),
    };

    // For spells that have charges the baseline cooldown is effectively junk data
    // see https://www.wowhead.com/spell=33206/pain-suppression
    // Listed cooldown of 1.5s which is nonsense
    newEffectsLibrary[spellId].cooldownSeconds =
      newEffectsLibrary[spellId].charges?.chargeCooldownSeconds || newEffectsLibrary[spellId].cooldownSeconds;
  });

  console.log('Writing updated spell effects data');
  const outputPath = path.resolve(__dirname, '../../shared/src/data/spellEffects.json');
  await fs.writeFile(outputPath, JSON.stringify(newEffectsLibrary, null, 2));
}

main();
