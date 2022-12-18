import fs from 'fs-extra';
import * as luainjs from 'lua-in-js';
import fetch from 'node-fetch';
import path from 'path';

async function main() {
  const response = await fetch('https://raw.githubusercontent.com/jordonwow/bigdebuffs/master/BigDebuffs_Mainline.lua');
  if (response.status !== 200) {
    throw new Error(`Failed to fetch BigDebuffs_Mainline.lua: ${response.status} ${response.statusText}`);
  }

  let text = await response.text();
  // do some necessary post-processing to make the lua parseable
  text = text.replace('local addonName, addon = ...', 'local addon = {}');
  text = text + '\nreturn addon';

  // execute the lua script and get the addon table
  const lua = luainjs.createEnv();
  const addon = (lua.parse(text).exec() as luainjs.Table).toObject() as Record<string, unknown>;

  const rawSpellsData = addon['Spells'] as Record<string, unknown>;
  const spells: Record<string, unknown> = {};
  Object.keys(rawSpellsData).forEach((spellId) => {
    if (!rawSpellsData[spellId]) {
      delete rawSpellsData[spellId];
    } else {
      spells[(parseInt(spellId, 10) + 1).toFixed()] = rawSpellsData[spellId];
    }
  });

  const outputPath = path.resolve(__dirname, '../../shared/src/data/spells.json');
  await fs.writeFile(outputPath, JSON.stringify(spells, null, 2));
}

main();
