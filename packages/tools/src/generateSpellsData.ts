/* eslint-disable no-console */
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

import { awcSpellIds } from '../../shared/src/data/awcSpells';
import taggedSpellsDump from '../../shared/src/data/spells.json';

const taggedSpellIds = Object.keys(taggedSpellsDump);

const WAGO_DB2_BASE = 'https://wago.tools/db2';
const SOURCE_TABLES = {
  spellCooldowns: `${WAGO_DB2_BASE}/SpellCooldowns/csv`,
  spellCategory: `${WAGO_DB2_BASE}/SpellCategory/csv`,
  spellCategories: `${WAGO_DB2_BASE}/SpellCategories/csv`,
  spellName: `${WAGO_DB2_BASE}/SpellName/csv`,
  spellDuration: `${WAGO_DB2_BASE}/SpellDuration/csv`,
  spellMisc: `${WAGO_DB2_BASE}/SpellMisc/csv`,
};

let spellCategory: {
  id: number;
  maxCharges: number;
  chargeRecoveryTime: number;
}[] = [];
let spellCategories: {
  spellId: number;
  difficultyId: number;
  chargeCategoryId: number;
}[] = [];
let spellNames: { id: number; name: string }[] = [];
let spellCDs: {
  spellId: number;
  difficultyId: number;
  categoryCooldown: number;
  cooldown: number;
}[] = [];
let spellDurations: { id: number; durationMs: number }[] = [];
let spellMiscInfo: {
  spellId: number;
  difficultyId: number;
  durationId: number;
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

type CsvRow = Record<string, string>;

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

function choosePreferredByDifficulty<T extends { difficultyId: number }>(current: T | undefined, candidate: T): T {
  if (!current) {
    return candidate;
  }
  if (current.difficultyId !== 0 && candidate.difficultyId === 0) {
    return candidate;
  }
  return current;
}

async function loadFiles() {
  const [spellCooldownRows, spellCategoryRows, spellCategoriesRows, spellNameRows, spellDurationRows, spellMiscRows] =
    await Promise.all([
      loadCsv(SOURCE_TABLES.spellCooldowns),
      loadCsv(SOURCE_TABLES.spellCategory),
      loadCsv(SOURCE_TABLES.spellCategories),
      loadCsv(SOURCE_TABLES.spellName),
      loadCsv(SOURCE_TABLES.spellDuration),
      loadCsv(SOURCE_TABLES.spellMisc),
    ]);

  spellCDs = spellCooldownRows.map((r) => ({
    spellId: toInt(r.SpellID),
    difficultyId: toInt(r.DifficultyID),
    categoryCooldown: toInt(r.CategoryRecoveryTime),
    cooldown: toInt(r.RecoveryTime),
  }));

  spellCategory = spellCategoryRows.map((r) => ({
    id: toInt(r.ID),
    maxCharges: toInt(r.MaxCharges),
    chargeRecoveryTime: toInt(r.ChargeRecoveryTime),
  }));

  spellCategories = spellCategoriesRows.map((r) => ({
    spellId: toInt(r.SpellID),
    difficultyId: toInt(r.DifficultyID),
    chargeCategoryId: toInt(r.ChargeCategory),
  }));

  spellNames = spellNameRows.map((r) => ({
    id: toInt(r.ID),
    name: r.Name_lang || 'NAME_NOT_FOUND',
  }));

  spellDurations = spellDurationRows.map((r) => ({
    id: toInt(r.ID),
    durationMs: toInt(r.Duration),
  }));

  spellMiscInfo = spellMiscRows.map((r) => ({
    spellId: toInt(r.SpellID),
    difficultyId: toInt(r.DifficultyID),
    durationId: toInt(r.DurationIndex),
  }));
}

const newEffectsLibrary: Record<string, ISpellDbEntry> = {};

function collectSpellIds(): string[] {
  const rawIds = [...taggedSpellIds, ...awcSpellIds];
  const validIds = rawIds.filter((id) => /^\d+$/.test(id));
  const invalidIds = rawIds.length - validIds.length;
  if (invalidIds > 0) {
    console.log(`Dropped ${invalidIds} invalid spell id entries.`);
  }
  return [...new Set(validIds)].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

const spellIds = collectSpellIds();

const spellNameById = new Map<number, string>();
const spellCooldownBySpellId = new Map<number, { difficultyId: number; cooldown: number; categoryCooldown: number }>();
const spellMiscBySpellId = new Map<number, { difficultyId: number; durationId: number }>();
const spellCategoriesBySpellId = new Map<number, { difficultyId: number; chargeCategoryId: number }>();
const spellCategoryById = new Map<number, { maxCharges: number; chargeRecoveryTime: number }>();
const spellDurationById = new Map<number, number>();

function findName(id: number): string {
  const maybeMatch = spellNameById.get(id);
  // Every spell id with a missing name must be accounted for!
  if (!maybeMatch) {
    console.log(`MISSING NAME ${id}`);
  }
  return maybeMatch ?? 'NAME_NOT_FOUND';
}

function findCooldown(id: number): number {
  const maybeMatch = spellCooldownBySpellId.get(id);
  // Missing cooldown info is mostly OK.. we have spell effects that have no cd (garrote silence) that we want
  // to track some info about
  // if (!maybeMatch) {
  //   console.log(`Missing cooldown ${id}`);
  // }
  return ((maybeMatch?.cooldown || maybeMatch?.categoryCooldown) ?? 999999) / 1000;
}

function findDuration(id: number): number {
  const matchMiscInfo = spellMiscBySpellId.get(id);
  if (!matchMiscInfo) {
    console.log(`Missing duration ${id}`);
    return 0;
  }

  const maybeMatch = spellDurationById.get(matchMiscInfo.durationId);
  return (maybeMatch ?? 0) / 1000; // if spell has no duration (is instant) this field will just not be in the array
}

function findCharges(id: number) {
  const spellCategoryInfo = spellCategoriesBySpellId.get(id);
  if (!spellCategoryInfo) return;

  const categoryInfo = spellCategoryById.get(spellCategoryInfo.chargeCategoryId);

  return categoryInfo?.maxCharges
    ? { charges: categoryInfo.maxCharges, chargeCooldownSeconds: categoryInfo.chargeRecoveryTime / 1000 }
    : undefined;
}

function buildIndexes() {
  spellNames.forEach((row) => {
    spellNameById.set(row.id, row.name);
  });

  spellCDs.forEach((row) => {
    const current = spellCooldownBySpellId.get(row.spellId);
    spellCooldownBySpellId.set(row.spellId, choosePreferredByDifficulty(current, row));
  });

  spellMiscInfo.forEach((row) => {
    const current = spellMiscBySpellId.get(row.spellId);
    spellMiscBySpellId.set(row.spellId, choosePreferredByDifficulty(current, row));
  });

  spellCategories.forEach((row) => {
    const current = spellCategoriesBySpellId.get(row.spellId);
    spellCategoriesBySpellId.set(row.spellId, choosePreferredByDifficulty(current, row));
  });

  spellCategory.forEach((row) => {
    spellCategoryById.set(row.id, { maxCharges: row.maxCharges, chargeRecoveryTime: row.chargeRecoveryTime });
  });

  spellDurations.forEach((row) => {
    spellDurationById.set(row.id, row.durationMs);
  });
}

async function main() {
  console.log('Loading data files from wago.tools');
  await loadFiles();
  buildIndexes();

  console.log('Parsing spells');
  spellIds.forEach((spellId) => {
    const spellIdInt = Number.parseInt(spellId, 10);
    newEffectsLibrary[spellId] = {
      spellId,
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
