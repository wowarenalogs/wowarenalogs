/* eslint-disable no-console */
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

import { WAGO_BUILD, withBuild } from './wagoConfig';

/**
 * Name substring used to identify Adaptation trinkets in ItemSparse.
 * SL–TWW passive auto-break trinkets are named "… Sigil of Adaptation".
 * (Older pre-SL items named "… Badge/Medallion of Adaptation" have a different
 * mechanic and are intentionally excluded by requiring the "Sigil" prefix.)
 */
const ADAPTATION_NAME_FRAGMENT = 'Sigil of Adaptation';

/**
 * Name substring used to identify Relentless trinkets in ItemSparse.
 * SL–TWW passive DR trinkets are named "… Relentless Brooch".
 */
const RELENTLESS_NAME_FRAGMENT = 'Relentless';

/**
 * InventoryType value for trinket slots in ItemSparse.
 * 12 = INVTYPE_TRINKET
 */
const TRINKET_INVENTORY_TYPE = '12';

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
  console.log(`Fetching ItemSparse CSV from wago.tools (build=${WAGO_BUILD})`);

  const itemSparseRows = await loadCsv(withBuild('ItemSparse'));

  if (itemSparseRows.length > 0 && itemSparseRows[0]['InventoryType'] === undefined) {
    throw new Error(
      `ItemSparse CSV missing expected column "InventoryType". ` +
        `Available columns: ${Object.keys(itemSparseRows[0]).join(', ')}`,
    );
  }
  if (itemSparseRows.length > 0 && itemSparseRows[0]['Display_lang'] === undefined) {
    throw new Error(
      `ItemSparse CSV missing expected column "Display_lang". ` +
        `Available columns: ${Object.keys(itemSparseRows[0]).join(', ')}`,
    );
  }

  const trinketRows = itemSparseRows.filter((r) => r['InventoryType'] === TRINKET_INVENTORY_TYPE);

  // Adaptation: trinket-slot items whose English name contains "Sigil of Adaptation"
  // (excludes older pre-SL "Badge/Medallion of Adaptation" which had a different mechanic)
  const adaptationItemIds = uniqueSortedIds(
    trinketRows
      .filter((r) => (r['Display_lang'] ?? '').includes(ADAPTATION_NAME_FRAGMENT))
      .map((r) => r['ID'])
      .filter(Boolean),
  );

  // Relentless: trinket-slot items whose English name contains "Relentless"
  const relentlessItemIds = uniqueSortedIds(
    trinketRows
      .filter((r) => (r['Display_lang'] ?? '').includes(RELENTLESS_NAME_FRAGMENT))
      .map((r) => r['ID'])
      .filter(Boolean),
  );

  const output = {
    generatedAt: new Date().toISOString(),
    sources: {
      itemSparseCsv: withBuild('ItemSparse'),
    },
    adaptationNameFragment: ADAPTATION_NAME_FRAGMENT,
    relentlessNameFragment: RELENTLESS_NAME_FRAGMENT,
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
