import fs from 'fs-extra';
import * as luainjs from 'lua-in-js';
import fetch from 'node-fetch';
import path from 'path';

const WAGO_DB2_BASE = 'https://wago.tools/db2';
const WAGO_BUILD = process.env.WAGO_BUILD || '12.0.1.66431';

function extractSpellIdsFromSpellCsv(csv: string): Set<string> {
  const ids = new Set<string>();
  const matches = Array.from(csv.matchAll(/(?:^|\n)(\d+),/g));
  for (const match of matches) {
    ids.add(match[1]);
  }
  return ids;
}

async function main() {
  const spellCsvResponse = await fetch(`${WAGO_DB2_BASE}/Spell/csv?build=${encodeURIComponent(WAGO_BUILD)}`);
  if (spellCsvResponse.status !== 200) {
    throw new Error(`Failed to fetch Spell.csv: ${spellCsvResponse.status} ${spellCsvResponse.statusText}`);
  }
  const spellCsv = await spellCsvResponse.text();
  const validSpellIds = extractSpellIdsFromSpellCsv(spellCsv);

  const response = await fetch('https://raw.githubusercontent.com/jordonwow/bigdebuffs/master/Spells/Vanilla.lua');
  if (response.status !== 200) {
    throw new Error(`Failed to fetch BigDebuffs spell data: ${response.status} ${response.statusText}`);
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
      const normalizedSpellId = (parseInt(spellId, 10) + 1).toFixed();
      if (validSpellIds.has(normalizedSpellId)) {
        spells[normalizedSpellId] = rawSpellsData[spellId];
      }
    }
  });

  const outputPath = path.resolve(__dirname, '../../shared/src/data/spells.json');
  await fs.writeFile(outputPath, JSON.stringify(spells, null, 2));
}

main();
