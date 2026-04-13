/* eslint-disable no-console */
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

// ── Configuration ───────────────────────────────────────────────────

const WAGO_DB2_BASE = 'https://wago.tools/db2';
const WAGO_BUILD = process.env.WAGO_BUILD || '12.0.1.66838';
const withBuild = (tableName: string) => `${WAGO_DB2_BASE}/${tableName}/csv?build=${encodeURIComponent(WAGO_BUILD)}`;

const SOURCE_TABLES = {
  chrSpecialization: withBuild('ChrSpecialization'),
  specializationSpells: withBuild('SpecializationSpells'),
  skillLineAbility: withBuild('SkillLineAbility'),
  spellName: withBuild('SpellName'),
};

// Class skill line IDs from the WoW DB2 SkillLine table.
// These are the SkillLine values that correspond to each class's baseline
// ability pool in SkillLineAbility. Sourced from SimulationCraft's
// dbc_extract3/dbc/constants.py CLASS_INFO.
const CLASS_SKILL_IDS: Record<number, number> = {
  1: 840, // Warrior
  2: 800, // Paladin
  3: 795, // Hunter
  4: 921, // Rogue
  5: 804, // Priest
  6: 796, // Death Knight
  7: 924, // Shaman
  8: 904, // Mage
  9: 849, // Warlock
  10: 829, // Monk
  11: 798, // Druid
  12: 1848, // Demon Hunter
  13: 2810, // Evoker
};

// Invert for fast lookup: skillLineId → classId
const SKILL_TO_CLASS = new Map<number, number>();
for (const [classId, skillId] of Object.entries(CLASS_SKILL_IDS)) {
  SKILL_TO_CLASS.set(skillId, Number(classId));
}

// ── CSV parsing (shared with generateSpellIdLists.ts) ───────────────

type CsvRow = Record<string, string>;

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
  console.log(`  Downloading ${url.split('/db2/')[1]?.split('/csv')[0] ?? url} ...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}. HTTP ${response.status}`);
  }
  const csv = await response.text();
  return parseCsv(csv);
}

function toInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ── Types ───────────────────────────────────────────────────────────

interface SpecInfo {
  specId: number;
  classId: number;
  specName: string;
}

interface SpellClassEntry {
  spellId: string;
  name: string;
  specIds: string[];
  source: 'SpecializationSpells' | 'SkillLineAbility' | 'TalentTree' | 'TalentTree:name' | 'unresolved';
}

interface IGeneratedSpellClassMap {
  generatedAt: string;
  wagoBuild: string;
  sources: {
    chrSpecializationCsv: string;
    specializationSpellsCsv: string;
    skillLineAbilityCsv: string;
    spellNameCsv: string;
    spellIdListsJson: string;
    talentIdMapJson: string;
  };
  /** For each category, a mapping of spellId → list of specIds that have access. */
  bigDefensive: SpellClassEntry[];
  externalDefensive: SpellClassEntry[];
  important: SpellClassEntry[];
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`Downloading DB2 CSVs from wago.tools (build=${WAGO_BUILD})\n`);

  const [chrSpecRows, specSpellRows, skillLineRows, spellNameRows] = await Promise.all([
    loadCsv(SOURCE_TABLES.chrSpecialization),
    loadCsv(SOURCE_TABLES.specializationSpells),
    loadCsv(SOURCE_TABLES.skillLineAbility),
    loadCsv(SOURCE_TABLES.spellName),
  ]);

  // ── 1. Build spec info lookup: specId → { classId, specName } ───
  // ChrSpecialization columns: Name_lang, ID, ClassID, ...
  const specInfoById = new Map<number, SpecInfo>();
  const specIdsByClassId = new Map<number, number[]>();

  for (const row of chrSpecRows) {
    const specId = toInt(row.ID);
    const classId = toInt(row.ClassID);
    const specName = row.Name_lang || '';
    // Skip pet specs (ClassID 0) and specs with no name
    if (classId === 0 || !specName) continue;

    specInfoById.set(specId, { specId, classId, specName });

    const existing = specIdsByClassId.get(classId) ?? [];
    existing.push(specId);
    specIdsByClassId.set(classId, existing);
  }

  console.log(`\nLoaded ${specInfoById.size} specializations across ${specIdsByClassId.size} classes`);

  // ── 2. Build spell → specIds from SpecializationSpells ──────────
  // Columns: Description_lang, ID, SpecID, SpellID, OverridesSpellID, DisplayOrder
  const specSpellMap = new Map<string, Set<string>>();

  for (const row of specSpellRows) {
    const specId = toInt(row.SpecID);
    const spellId = row.SpellID;
    if (!spellId || specId === 0) continue;

    const spec = specInfoById.get(specId);
    if (!spec) continue; // skip pet/unknown specs

    const existing = specSpellMap.get(spellId) ?? new Set<string>();
    existing.add(String(specId));
    specSpellMap.set(spellId, existing);
  }

  console.log(`Built SpecializationSpells index: ${specSpellMap.size} unique spells`);

  // ── 3. Build spell → classId from SkillLineAbility ──────────────
  // Columns: ..., SkillLine, Spell, ..., AcquireMethod, ...
  // Only keep rows where SkillLine is a known class skill ID.
  // Following simc's filter: exclude AcquireMethod 3.
  const classSpellMap = new Map<string, Set<number>>();

  for (const row of skillLineRows) {
    const skillLine = toInt(row.SkillLine);
    const classId = SKILL_TO_CLASS.get(skillLine);
    if (classId === undefined) continue;

    const spellId = row.Spell;
    if (!spellId || spellId === '0') continue;

    const acquireMethod = toInt(row.AcquireMethod);
    if (acquireMethod === 3) continue;

    const existingClasses = classSpellMap.get(spellId) ?? new Set<number>();
    existingClasses.add(classId);
    classSpellMap.set(spellId, existingClasses);
  }

  console.log(`Built SkillLineAbility class index: ${classSpellMap.size} unique spells across class skill lines`);

  // ── 4. Build spell name lookup ──────────────────────────────────
  const spellNamesById = new Map<string, string>();
  for (const row of spellNameRows) {
    spellNamesById.set(row.ID, row.Name_lang || '');
  }

  // ── 5. Load existing spellIdLists.json and talentIdMap.json ─────
  const spellIdListsPath = path.resolve(__dirname, '../../shared/src/data/spellIdLists.json');
  const spellIdLists = await fs.readJson(spellIdListsPath);

  const talentIdMapPath = path.resolve(__dirname, '../../shared/src/data/talentIdMap.json');
  const talentIdMap = await fs.readJson(talentIdMapPath);

  // ── 6. Build talent tree spell indexes ────────────────────────
  // talentIdMap is an array of per-spec entries, each with classNodes and specNodes.
  // classNodes = shared by all specs of the class; specNodes = spec-specific.
  // Each node has entries[] with spellId fields.

  // Index 1: spellId → specIds (exact match)
  const talentSpellMap = new Map<string, Set<number>>();
  // Index 2: spellName → [{specId, spellId}] (for name-based fallback)
  const talentNameMap = new Map<string, Array<{ specId: number; spellId: string }>>();

  for (const tree of talentIdMap) {
    const specId = tree.specId as number;
    if (!specId) continue;

    const allNodes = [...(tree.classNodes || []), ...(tree.specNodes || [])];
    for (const node of allNodes) {
      const nodeName = (node.name || '') as string;
      for (const entry of node.entries || []) {
        const spellId = String(entry.spellId);
        if (!spellId || spellId === '0') continue;

        // Exact spell ID index
        const existingSpell = talentSpellMap.get(spellId) ?? new Set<number>();
        existingSpell.add(specId);
        talentSpellMap.set(spellId, existingSpell);

        // Name-based index
        if (nodeName) {
          const key = nodeName.toLowerCase();
          const existingName = talentNameMap.get(key) ?? [];
          existingName.push({ specId, spellId });
          talentNameMap.set(key, existingName);
        }
      }
    }
  }

  console.log(
    `Built talent tree index: ${talentSpellMap.size} unique spell IDs, ${talentNameMap.size} unique spell names`,
  );

  // ── 7. Resolve each spell to its spec IDs ───────────────────────

  function resolveSpell(spellId: string): SpellClassEntry {
    const name = spellNamesById.get(spellId) || '';

    // Priority 1: SpecializationSpells (spec-specific baseline)
    const fromSpecSpells = specSpellMap.get(spellId);
    if (fromSpecSpells && fromSpecSpells.size > 0) {
      return {
        spellId,
        name,
        specIds: Array.from(fromSpecSpells).sort((a, b) => Number(a) - Number(b)),
        source: 'SpecializationSpells',
      };
    }

    // Priority 2: SkillLineAbility (class-wide baseline → expand to all specs)
    const fromSkillLine = classSpellMap.get(spellId);
    if (fromSkillLine && fromSkillLine.size > 0) {
      const allSpecIds = new Set<string>();
      Array.from(fromSkillLine).forEach((classId) => {
        const specs = specIdsByClassId.get(classId) ?? [];
        specs.forEach((sid) => {
          allSpecIds.add(String(sid));
        });
      });
      return {
        spellId,
        name,
        specIds: Array.from(allSpecIds).sort((a, b) => Number(a) - Number(b)),
        source: 'SkillLineAbility',
      };
    }

    // Priority 3: Talent tree — exact spell ID match
    const fromTalentExact = talentSpellMap.get(spellId);
    if (fromTalentExact && fromTalentExact.size > 0) {
      return {
        spellId,
        name,
        specIds: Array.from(fromTalentExact)
          .map(String)
          .sort((a, b) => Number(a) - Number(b)),
        source: 'TalentTree',
      };
    }

    // Priority 4: Talent tree — name-based fallback.
    // Some spells have different IDs in SpellMisc vs the talent tree (e.g.,
    // Survival Instincts is 50322 in bigDefensive but 61336 in talents).
    if (name) {
      const byName = talentNameMap.get(name.toLowerCase());
      if (byName && byName.length > 0) {
        const specIds = new Set<string>();
        byName.forEach((hit) => specIds.add(String(hit.specId)));
        return {
          spellId,
          name,
          specIds: Array.from(specIds).sort((a, b) => Number(a) - Number(b)),
          source: 'TalentTree:name',
        };
      }
    }

    // Not found in any source
    return { spellId, name, specIds: [], source: 'unresolved' };
  }

  function resolveCategory(spellIds: string[]): SpellClassEntry[] {
    return spellIds.map(resolveSpell);
  }

  const bigDefensive = resolveCategory(spellIdLists.bigDefensiveSpellIds);
  const externalDefensive = resolveCategory(spellIdLists.externalDefensiveSpellIds);
  const important = resolveCategory(spellIdLists.importantSpellIds);

  // ── 8. Report ───────────────────────────────────────────────────

  function reportCategory(label: string, entries: SpellClassEntry[]) {
    const resolved = entries.filter((e) => e.specIds.length > 0);
    const unresolved = entries.filter((e) => e.specIds.length === 0);

    // Count by source
    const bySrc: Record<string, number> = {};
    resolved.forEach((e) => {
      bySrc[e.source] = (bySrc[e.source] || 0) + 1;
    });
    const srcSummary = Object.entries(bySrc)
      .map(([s, n]) => `${s}=${n}`)
      .join(', ');

    console.log(`\n${label}: ${resolved.length}/${entries.length} resolved (${srcSummary})`);
    if (unresolved.length > 0) {
      for (const e of unresolved) {
        console.log(`  ⚠ unresolved: ${e.spellId} (${e.name})`);
      }
    }
  }

  reportCategory('bigDefensive', bigDefensive);
  reportCategory('externalDefensive', externalDefensive);
  reportCategory('important', important);

  // ── 9. Write output ─────────────────────────────────────────────

  const output: IGeneratedSpellClassMap = {
    generatedAt: new Date().toISOString(),
    wagoBuild: WAGO_BUILD,
    sources: {
      chrSpecializationCsv: SOURCE_TABLES.chrSpecialization,
      specializationSpellsCsv: SOURCE_TABLES.specializationSpells,
      skillLineAbilityCsv: SOURCE_TABLES.skillLineAbility,
      spellNameCsv: SOURCE_TABLES.spellName,
      spellIdListsJson: 'packages/shared/src/data/spellIdLists.json',
      talentIdMapJson: 'packages/shared/src/data/talentIdMap.json',
    },
    bigDefensive,
    externalDefensive,
    important,
  };

  const outputPath = path.resolve(__dirname, '../../shared/src/data/spellClassMap.json');
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nWrote spell class map to ${outputPath}`);
}

main();
