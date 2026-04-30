/* eslint-disable no-console */
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

import { WAGO_BUILD, withBuild } from './wagoConfig';

/** Spell ID for the Adaptation auto-break proc — verified from ccTrinketAnalysis.ts */
const ADAPTATION_PROC_SPELL_ID = '195756';

/**
 * Column name in ItemEffect CSV for the owning item ID.
 * wago.tools builds 10.x–12.x use "ParentItemID". Change to "ItemID" if the CSV
 * header shows something different (print Object.keys(rows[0]) to verify).
 */
const ITEM_EFFECT_ITEM_ID_COL = 'ParentItemID';

type CsvRow = Record<string, string>;

function parseCsvRows(csv: string): CsvRow[] {
  const lines = csv.split('\n');
  if (lines.length < 2) throw new Error('CSV payload appears empty.');
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',');
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').replace(/^"|"$/g, '');
    });
    rows.push(row);
  }
  return rows;
}

async function loadCsv(url: string): Promise<CsvRow[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return parseCsvRows(await res.text());
}

function uniqueSortedIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => /^\d+$/.test(id)))).sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10),
  );
}

async function main() {
  console.log(`Fetching ItemEffect + ItemSparse CSVs from wago.tools (build=${WAGO_BUILD})`);

  const [itemEffectRows, itemSparseRows] = await Promise.all([
    loadCsv(withBuild('ItemEffect')),
    loadCsv(withBuild('ItemSparse')),
  ]);

  if (itemEffectRows.length > 0 && itemEffectRows[0][ITEM_EFFECT_ITEM_ID_COL] === undefined) {
    throw new Error(
      `ItemEffect CSV missing expected column "${ITEM_EFFECT_ITEM_ID_COL}". ` +
        `Available columns: ${Object.keys(itemEffectRows[0]).join(', ')}`,
    );
  }
  if (itemSparseRows.length > 0 && itemSparseRows[0]['InventoryType'] === undefined) {
    throw new Error(
      `ItemSparse CSV missing expected column "InventoryType". ` +
        `Available columns: ${Object.keys(itemSparseRows[0]).join(', ')}`,
    );
  }

  // Adaptation: items whose on-equip or proc spell is the Adaptation break (195756)
  const adaptationItemIds = uniqueSortedIds(
    itemEffectRows
      .filter((r) => r['SpellID'] === ADAPTATION_PROC_SPELL_ID)
      .map((r) => r[ITEM_EFFECT_ITEM_ID_COL])
      .filter(Boolean),
  );

  // Relentless: trinket-slot items whose English name contains "Relentless"
  const relentlessItemIds = uniqueSortedIds(
    itemSparseRows
      .filter((r) => r['InventoryType'] === '12' && (r['Display_lang'] ?? '').includes('Relentless'))
      .map((r) => r['ID'])
      .filter(Boolean),
  );

  const output = {
    generatedAt: new Date().toISOString(),
    sources: {
      itemEffectCsv: withBuild('ItemEffect'),
      itemSparseCsv: withBuild('ItemSparse'),
    },
    adaptationSpellId: ADAPTATION_PROC_SPELL_ID,
    adaptationItemIds,
    relentlessItemIds,
  };

  const outputPath = path.resolve(__dirname, '../../shared/src/data/trinketItemIds.json');
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`Adaptation item IDs (${adaptationItemIds.length}): ${adaptationItemIds.join(', ')}`);
  console.log(`Relentless item IDs (${relentlessItemIds.length}): ${relentlessItemIds.join(', ')}`);
  console.log(`Wrote trinketItemIds.json to ${outputPath}`);
}

main();
