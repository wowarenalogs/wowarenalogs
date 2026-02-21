/* eslint-disable no-console */
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

const WAGO_DB2_BASE = 'https://wago.tools/db2';
const SOURCE_TABLES = {
  spell: `${WAGO_DB2_BASE}/Spell/csv`,
  spellMisc: `${WAGO_DB2_BASE}/SpellMisc/csv`,
};

// Attribute ids sourced from:
// - https://github.com/simulationcraft/simc/pull/10881 (Important: 491)
// - https://github.com/simulationcraft/simc/pull/10901 (External Defensive: 499, Big Defensive: 512)
const SPELL_ATTRIBUTE_IDS = {
  important: 491,
  externalDefensive: 499,
  bigDefensive: 512,
} as const;

type CsvRow = Record<string, string>;

interface IGeneratedSpellIdLists {
  generatedAt: string;
  sources: {
    spellCsv: string;
    spellMiscCsv: string;
  };
  bitDefinitions: {
    important: IBitDefinition;
    externalDefensive: IBitDefinition;
    bigDefensive: IBitDefinition;
  };
  allSpellIds: string[];
  importantSpellIds: string[];
  externalDefensiveSpellIds: string[];
  bigDefensiveSpellIds: string[];
  externalOrBigDefensiveSpellIds: string[];
}

interface IBitDefinition {
  attributeId: number;
  column: string;
  mask: number;
  bitIndexInColumn: number;
}

function toInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsv(csv: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (!inQuotes && char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (!inQuotes && char === '\r') {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length < 2) {
    throw new Error('CSV payload appears empty.');
  }

  const headers = rows[0];
  return rows.slice(1).map((values) => {
    const result: CsvRow = {};
    headers.forEach((header, index) => {
      result[header] = values[index] ?? '';
    });
    return result;
  });
}

async function loadCsv(url: string): Promise<CsvRow[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}. HTTP ${response.status}`);
  }
  const csv = await response.text();
  return parseCsv(csv);
}

function uniqueSortedNumericStrings(spellIds: string[]): string[] {
  return [...new Set(spellIds.filter((id) => /^\d+$/.test(id)))].sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10),
  );
}

function getBitDefinition(attributeId: number): IBitDefinition {
  const bitIndexOverall = attributeId - 1;
  const columnIndex = Math.floor(bitIndexOverall / 32);
  const bitIndexInColumn = bitIndexOverall % 32;
  return {
    attributeId,
    column: `Attributes_${columnIndex}`,
    mask: 2 ** bitIndexInColumn,
    bitIndexInColumn,
  };
}

function hasAttributeFlag(row: CsvRow, bitDef: IBitDefinition): boolean {
  const value = toInt(row[bitDef.column] || '0');
  return (value & bitDef.mask) !== 0;
}

async function main() {
  console.log('Downloading Spell + SpellMisc CSV data from wago.tools');
  const [spellRows, spellMiscRows] = await Promise.all([
    loadCsv(SOURCE_TABLES.spell),
    loadCsv(SOURCE_TABLES.spellMisc),
  ]);

  const allSpellIds = uniqueSortedNumericStrings(spellRows.map((r) => r.ID));

  const importantBitDef = getBitDefinition(SPELL_ATTRIBUTE_IDS.important);
  const externalDefBitDef = getBitDefinition(SPELL_ATTRIBUTE_IDS.externalDefensive);
  const bigDefBitDef = getBitDefinition(SPELL_ATTRIBUTE_IDS.bigDefensive);

  const importantSpellIds = uniqueSortedNumericStrings(
    spellMiscRows.filter((r) => hasAttributeFlag(r, importantBitDef)).map((r) => r.SpellID),
  );
  const externalDefensiveSpellIds = uniqueSortedNumericStrings(
    spellMiscRows.filter((r) => hasAttributeFlag(r, externalDefBitDef)).map((r) => r.SpellID),
  );
  const bigDefensiveSpellIds = uniqueSortedNumericStrings(
    spellMiscRows.filter((r) => hasAttributeFlag(r, bigDefBitDef)).map((r) => r.SpellID),
  );
  const externalOrBigDefensiveSpellIds = uniqueSortedNumericStrings([
    ...externalDefensiveSpellIds,
    ...bigDefensiveSpellIds,
  ]);

  const output: IGeneratedSpellIdLists = {
    generatedAt: new Date().toISOString(),
    sources: {
      spellCsv: SOURCE_TABLES.spell,
      spellMiscCsv: SOURCE_TABLES.spellMisc,
    },
    bitDefinitions: {
      important: importantBitDef,
      externalDefensive: externalDefBitDef,
      bigDefensive: bigDefBitDef,
    },
    allSpellIds,
    importantSpellIds,
    externalDefensiveSpellIds,
    bigDefensiveSpellIds,
    externalOrBigDefensiveSpellIds,
  };

  const outputPath = path.resolve(__dirname, '../../shared/src/data/spellIdLists.json');
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote spell id lists to ${outputPath}`);
  console.log(`allSpellIds: ${allSpellIds.length}`);
  console.log(`importantSpellIds: ${importantSpellIds.length}`);
  console.log(`externalDefensiveSpellIds: ${externalDefensiveSpellIds.length}`);
  console.log(`bigDefensiveSpellIds: ${bigDefensiveSpellIds.length}`);
  console.log(`externalOrBigDefensiveSpellIds: ${externalOrBigDefensiveSpellIds.length}`);
}

main();
