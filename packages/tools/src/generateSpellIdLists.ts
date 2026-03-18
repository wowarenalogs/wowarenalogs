/* eslint-disable no-console */
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

const WAGO_DB2_BASE = 'https://wago.tools/db2';
const WAGO_BUILD = process.env.WAGO_BUILD || '12.0.1.66431';
const withBuild = (tableName: string) => `${WAGO_DB2_BASE}/${tableName}/csv?build=${encodeURIComponent(WAGO_BUILD)}`;
const SOURCE_TABLES = {
  spell: withBuild('Spell'),
  spellMisc: withBuild('SpellMisc'),
  spellName: withBuild('SpellName'),
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
    spellNameCsv: string;
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

interface INamedSpell {
  spellId: string;
  name: string;
}

interface IGeneratedSpellIdListsWithNames {
  generatedAt: string;
  sources: {
    spellCsv: string;
    spellMiscCsv: string;
    spellNameCsv: string;
  };
  bitDefinitions: {
    important: IBitDefinition;
    externalDefensive: IBitDefinition;
    bigDefensive: IBitDefinition;
  };
  allSpells: INamedSpell[];
  importantSpells: INamedSpell[];
  externalDefensiveSpells: INamedSpell[];
  bigDefensiveSpells: INamedSpell[];
  externalOrBigDefensiveSpells: INamedSpell[];
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
  return Array.from(new Set(spellIds.filter((id) => /^\d+$/.test(id)))).sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10),
  );
}

function getBitDefinition(attributeId: number): IBitDefinition {
  // SimC spell attribute ids are 0-based indices into the Attributes_* bitfield.
  const bitIndexOverall = attributeId;
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

function enrichWithNames(spellIds: string[], namesById: Map<string, string>): INamedSpell[] {
  return spellIds.map((spellId) => ({
    spellId,
    name: namesById.get(spellId) || '',
  }));
}

async function main() {
  console.log(`Downloading Spell + SpellMisc + SpellName CSV data from wago.tools (build=${WAGO_BUILD})`);
  const [spellRows, spellMiscRows, spellNameRows] = await Promise.all([
    loadCsv(SOURCE_TABLES.spell),
    loadCsv(SOURCE_TABLES.spellMisc),
    loadCsv(SOURCE_TABLES.spellName),
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
  const spellNamesById = new Map<string, string>();
  spellNameRows.forEach((row) => {
    spellNamesById.set(row.ID, row.Name_lang || '');
  });

  const output: IGeneratedSpellIdLists = {
    generatedAt: new Date().toISOString(),
    sources: {
      spellCsv: SOURCE_TABLES.spell,
      spellMiscCsv: SOURCE_TABLES.spellMisc,
      spellNameCsv: SOURCE_TABLES.spellName,
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
  const reviewOutput: IGeneratedSpellIdListsWithNames = {
    generatedAt: output.generatedAt,
    sources: output.sources,
    bitDefinitions: output.bitDefinitions,
    allSpells: enrichWithNames(allSpellIds, spellNamesById),
    importantSpells: enrichWithNames(importantSpellIds, spellNamesById),
    externalDefensiveSpells: enrichWithNames(externalDefensiveSpellIds, spellNamesById),
    bigDefensiveSpells: enrichWithNames(bigDefensiveSpellIds, spellNamesById),
    externalOrBigDefensiveSpells: enrichWithNames(externalOrBigDefensiveSpellIds, spellNamesById),
  };

  const outputPath = path.resolve(__dirname, '../../shared/src/data/spellIdLists.json');
  const reviewDirPath = path.resolve(__dirname, '../../shared/src/data/spellIdListsReview');
  await fs.ensureDir(reviewDirPath);
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  await fs.writeFile(
    path.resolve(reviewDirPath, 'metadata.json'),
    `${JSON.stringify(
      {
        generatedAt: output.generatedAt,
        sources: output.sources,
        bitDefinitions: output.bitDefinitions,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(
    path.resolve(reviewDirPath, 'importantSpellsWithNames.json'),
    `${JSON.stringify(reviewOutput.importantSpells, null, 2)}\n`,
  );
  await fs.writeFile(
    path.resolve(reviewDirPath, 'externalDefensiveSpellsWithNames.json'),
    `${JSON.stringify(reviewOutput.externalDefensiveSpells, null, 2)}\n`,
  );
  await fs.writeFile(
    path.resolve(reviewDirPath, 'bigDefensiveSpellsWithNames.json'),
    `${JSON.stringify(reviewOutput.bigDefensiveSpells, null, 2)}\n`,
  );
  console.log(`Wrote spell id lists to ${outputPath}`);
  console.log(`Wrote per-category review files to ${reviewDirPath}`);
  console.log(`allSpellIds: ${allSpellIds.length}`);
  console.log(`importantSpellIds: ${importantSpellIds.length}`);
  console.log(`externalDefensiveSpellIds: ${externalDefensiveSpellIds.length}`);
  console.log(`bigDefensiveSpellIds: ${bigDefensiveSpellIds.length}`);
  console.log(`externalOrBigDefensiveSpellIds: ${externalOrBigDefensiveSpellIds.length}`);
}

main();
