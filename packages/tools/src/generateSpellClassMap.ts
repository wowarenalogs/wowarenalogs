/* eslint-disable no-console */
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

import { WAGO_BUILD, withBuild } from './wagoConfig';

// ── Configuration ───────────────────────────────────────────────────

const SOURCE_TABLES = {
  chrSpecialization: withBuild('ChrSpecialization'),
  specializationSpells: withBuild('SpecializationSpells'),
  skillLineAbility: withBuild('SkillLineAbility'),
  pvpTalent: withBuild('PvpTalent'),
  spellName: withBuild('SpellName'),
  spellCategories: withBuild('SpellCategories'),
  spellEffect: withBuild('SpellEffect'),
  spellLabel: withBuild('SpellLabel'),
  spell: withBuild('Spell'),
  skillLine: withBuild('SkillLine'),
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
  source:
    | 'SpecializationSpells'
    | 'PvpTalent'
    | 'SkillLineAbility'
    | 'TalentTree'
    | 'PetSkillLine'
    | 'DescriptionRef'
    | 'unresolved';
}

/** Spells flagged by DB2 attributes that share a name with a talent but couldn't be ID-resolved. */
interface UnresolvedSpellEntry {
  spellId: string;
  name: string;
  category: string;
  /** Talent tree spell IDs that share this name (the IDs Blizzard likely meant to flag). */
  talentSpellIds: string[];
  talentSpecIds: string[];
}

interface DiminishEntry {
  spellId: string;
  name: string;
  specIds?: string[];
}

interface InterruptEntry {
  spellId: string;
  name: string;
  specIds: string[];
}

interface IGeneratedSpellClassMap {
  generatedAt: string;
  wagoBuild: string;
  sources: {
    chrSpecializationCsv: string;
    specializationSpellsCsv: string;
    skillLineAbilityCsv: string;
    pvpTalentCsv: string;
    spellNameCsv: string;
    spellCategoriesCsv: string;
    spellEffectCsv: string;
    spellLabelCsv: string;
    spellCsv: string;
    skillLineCsv: string;
    spellIdListsJson: string;
    talentIdMapJson: string;
  };
  /** For each category, a mapping of spellId → list of specIds that have access. */
  bigDefensive: SpellClassEntry[];
  externalDefensive: SpellClassEntry[];
  important: SpellClassEntry[];
  /** Diminishing returns groups from SpellCategories.DiminishType */
  diminishingReturns: Record<string, DiminishEntry[]>;
  /** Interrupt (kick) spells that only interrupt, excluding silences. */
  interrupts: InterruptEntry[];
  /** Spells flagged by DB2 attributes that could not be ID-resolved to player specs.
   *  These likely represent Blizzard flagging the wrong spell ID. For bug reporting only. */
  unresolvedSpells: UnresolvedSpellEntry[];
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`Downloading DB2 CSVs from wago.tools (build=${WAGO_BUILD})\n`);

  const [
    chrSpecRows,
    specSpellRows,
    skillLineRows,
    pvpTalentRows,
    spellNameRows,
    spellCategoryRows,
    spellEffectRows,
    spellLabelRows,
    spellRows,
    skillLineDefRows,
  ] = await Promise.all([
    loadCsv(SOURCE_TABLES.chrSpecialization),
    loadCsv(SOURCE_TABLES.specializationSpells),
    loadCsv(SOURCE_TABLES.skillLineAbility),
    loadCsv(SOURCE_TABLES.pvpTalent),
    loadCsv(SOURCE_TABLES.spellName),
    loadCsv(SOURCE_TABLES.spellCategories),
    loadCsv(SOURCE_TABLES.spellEffect),
    loadCsv(SOURCE_TABLES.spellLabel),
    loadCsv(SOURCE_TABLES.spell),
    loadCsv(SOURCE_TABLES.skillLine),
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

  // ── 2b. Build spell → specIds from PvpTalent ──────────────────
  // Columns: Description_lang, ID, SpecID, SpellID, OverridesSpellID, Flags, ActionBarSpellID, ...
  const pvpTalentMap = new Map<string, Set<string>>();

  for (const row of pvpTalentRows) {
    const specId = toInt(row.SpecID);
    const spellId = row.SpellID;
    if (!spellId || spellId === '0' || specId === 0) continue;

    const spec = specInfoById.get(specId);
    if (!spec) continue;

    const existing = pvpTalentMap.get(spellId) ?? new Set<string>();
    existing.add(String(specId));
    pvpTalentMap.set(spellId, existing);

    // Also index the ActionBarSpellID if present (the castable spell that
    // appears on the action bar when this PvP talent is selected).
    const actionBarId = row.ActionBarSpellID;
    if (actionBarId && actionBarId !== '0' && actionBarId !== spellId) {
      const abExisting = pvpTalentMap.get(actionBarId) ?? new Set<string>();
      abExisting.add(String(specId));
      pvpTalentMap.set(actionBarId, abExisting);
    }
  }

  console.log(`Built PvpTalent index: ${pvpTalentMap.size} unique spells`);

  // ── 3. Build spell → classId from SkillLineAbility ──────────────
  // Columns: ..., SkillLine, Spell, ..., AcquireMethod, ...
  // Only keep rows where SkillLine is a known class skill ID.
  // AcquireMethod filtering: only include entries with AcquireMethod >= 2.
  // AcquireMethod=0 entries are legacy/deprecated spells that were never
  // cleaned up (e.g. Fists of Fury 117418 still listed as class-wide Monk
  // even though it's Windwalker-only and no longer stuns).
  // AcquireMethod=2 = auto-learned baseline, 3 = learned via other means,
  // 4 = base variant of cosmetic set (e.g. Polymorph sheep).
  const classSpellMap = new Map<string, Set<number>>();

  for (const row of skillLineRows) {
    const skillLine = toInt(row.SkillLine);
    const classId = SKILL_TO_CLASS.get(skillLine);
    if (classId === undefined) continue;

    const spellId = row.Spell;
    if (!spellId || spellId === '0') continue;

    const acquireMethod = toInt(row.AcquireMethod);
    if (acquireMethod < 2) continue;

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

  // ── 4b. Build diminishing returns groups from SpellCategories ────
  // SpellCategories.DiminishType is a bitmask: 2^(SpellDiminish.ID - 1).
  // SpellDiminish IDs: 1=Root, 2=Taunt, 3=Stun, 4=AoE Knockback,
  //   5=Incapacitate, 6=Disorient, 7=Silence, 8=Disarm
  // A spell with DiminishType 48 (=16+32) shares Incapacitate+Disorient DR.
  // We decompose the bitmask and assign the spell to each matching group.
  const DIMINISH_BIT_NAMES: Record<number, string> = {
    1: 'root',
    2: 'taunt',
    4: 'stun',
    8: 'knockback',
    16: 'incapacitate',
    32: 'disorient',
    64: 'silence',
    128: 'disarm',
  };

  const diminishingReturns: Record<string, DiminishEntry[]> = {};
  for (const groupName of Object.values(DIMINISH_BIT_NAMES)) {
    diminishingReturns[groupName] = [];
  }

  for (const row of spellCategoryRows) {
    const diminishType = toInt(row.DiminishType);
    if (diminishType === 0) continue;
    const spellId = row.SpellID;
    if (!spellId || spellId === '0') continue;
    const name = spellNamesById.get(spellId) || '';

    // Decompose bitmask into individual groups
    for (const [bit, groupName] of Object.entries(DIMINISH_BIT_NAMES)) {
      if (diminishType & Number(bit)) {
        diminishingReturns[groupName].push({ spellId, name });
      }
    }
  }

  for (const [group, entries] of Object.entries(diminishingReturns)) {
    entries.sort((a, b) => Number(a.spellId) - Number(b.spellId));
    console.log(`DR group ${group}: ${entries.length} spells`);
  }

  // ── 4c. Build interrupt spell list from SpellEffect ──────────────
  // Effect=68 is SPELL_EFFECT_INTERRUPT_CAST.
  // We collect all spells with this effect, then filter to player-class spells.
  // Exclude spells that also apply a silence aura (EffectAura=27), since those
  // can be used pre-emptively and a "miss" isn't necessarily a mistake.
  const EFFECT_INTERRUPT_CAST = 68;
  const EFFECT_APPLY_AURA = 6;
  const AURA_MOD_SILENCE = 27;
  const AURA_OVERRIDE_ACTION_SPELL = 332;

  const interruptSpellIds = new Set<string>();
  const silenceSpellIds = new Set<string>();
  // Override map: talent spell ID → set of replacement spell IDs it grants.
  // Built from "Override Action Spell" aura effects (EffectAura=332).
  // e.g. talent 414659 (Ice Cold passive) overrides Ice Block with 414658 (Ice Cold cast).
  const overrideMap = new Map<string, Set<string>>();

  for (const row of spellEffectRows) {
    const effect = toInt(row.Effect);
    const spellId = row.SpellID;
    if (!spellId || spellId === '0') continue;

    if (effect === EFFECT_INTERRUPT_CAST) {
      interruptSpellIds.add(spellId);
    }
    if (effect === EFFECT_APPLY_AURA && toInt(row.EffectAura) === AURA_MOD_SILENCE) {
      silenceSpellIds.add(spellId);
    }
    if (effect === EFFECT_APPLY_AURA && toInt(row.EffectAura) === AURA_OVERRIDE_ACTION_SPELL) {
      // EffectBasePointsF is the replacement spell ID
      const replacementId = row.EffectBasePointsF ? String(Math.round(Number(row.EffectBasePointsF))) : null;
      if (replacementId && replacementId !== '0' && replacementId !== spellId) {
        const existing = overrideMap.get(spellId) ?? new Set<string>();
        existing.add(replacementId);
        overrideMap.set(spellId, existing);
      }
    }
  }

  // Remove spells that also silence (e.g., Avenger's Shield)
  for (const id of Array.from(silenceSpellIds)) {
    interruptSpellIds.delete(id);
  }

  console.log(
    `Found ${interruptSpellIds.size} interrupt spells (after excluding ${silenceSpellIds.size} silence spells)`,
  );
  console.log(`Built override map: ${overrideMap.size} talent spells with Override Action Spell effects`);

  // ── 4d. Build totem spell linkage from SpellLabel ──────────────
  // SpellLabel 1660 groups totem placement spells with their effect spells.
  // e.g. Capacitor Totem placement (192058) shares label 1660 with the
  // stun effect (118905). This lets us attribute totem CC effects to the
  // specs that have the placement talent.
  const TOTEM_LABEL_ID = '1660';
  const totemLabelSpellIds = new Set<string>();
  for (const row of spellLabelRows) {
    if (row.LabelID === TOTEM_LABEL_ID) {
      totemLabelSpellIds.add(row.SpellID);
    }
  }
  console.log(`Built totem label index (label ${TOTEM_LABEL_ID}): ${totemLabelSpellIds.size} spells`);

  // ── 4e. Build description-referenced spell map from Spell table ──
  // Spell descriptions reference other spell IDs for duration display via
  // $SPELLIDd syntax (e.g. "stunning them for $117526d"). This links talent
  // placement spells to their CC effect spells (e.g. Binding Shot 109248
  // references stun 117526). We only match duration references ($IDd) to
  // avoid false positives from damage coefficient references ($IDs1).
  const descriptionRefMap = new Map<string, Set<string>>();
  const DURATION_REF_REGEX = /\$(\d{4,})d/g;

  for (const row of spellRows) {
    const spellId = row.ID;
    if (!spellId || spellId === '0') continue;
    const desc = row.Description_lang || '';
    if (!desc) continue;

    let match;
    DURATION_REF_REGEX.lastIndex = 0;
    while ((match = DURATION_REF_REGEX.exec(desc)) !== null) {
      const refId = match[1];
      if (refId === spellId) continue;
      const existing = descriptionRefMap.get(spellId) ?? new Set<string>();
      existing.add(refId);
      descriptionRefMap.set(spellId, existing);
    }
  }

  console.log(`Built description reference map: ${descriptionRefMap.size} spells with duration references`);

  // ── 4f. Build reverse description-reference index ──────────────
  // For each child spell C, list parents P where P's description contains
  // $Cd (duration reference). Used at the lowest resolution priority to
  // attribute orphan aura-spell IDs (e.g. Lightning Lasso stun 305485,
  // referenced by PvP talent cast 305483) to the specs that own the parent.
  const reverseDescriptionRefMap = new Map<string, Set<string>>();
  descriptionRefMap.forEach((refs, parentId) => {
    refs.forEach((refId) => {
      const existing = reverseDescriptionRefMap.get(refId) ?? new Set<string>();
      existing.add(parentId);
      reverseDescriptionRefMap.set(refId, existing);
    });
  });
  console.log(`Built reverse description reference map: ${reverseDescriptionRefMap.size} referenced spells`);

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
  // Index 2: spellName → [{specId, spellId}] (for detecting unresolved spells with name matches)
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

        // Exact spell ID index — include spellId, visibleSpellId, and any
        // Override Action Spell replacement IDs from SpellEffect data.
        const idsToIndex = [spellId];
        const visibleId = entry.visibleSpellId ? String(entry.visibleSpellId) : null;
        if (visibleId && visibleId !== '0' && visibleId !== spellId) {
          idsToIndex.push(visibleId);
        }
        // If this talent spell overrides another spell with a replacement,
        // index the replacement ID too (e.g. talent 414659 grants cast 414658).
        const overrides = overrideMap.get(spellId);
        if (overrides) {
          Array.from(overrides).forEach((replacementId) => {
            if (!idsToIndex.includes(replacementId)) {
              idsToIndex.push(replacementId);
            }
          });
        }
        // If this talent spell shares SpellLabel 1660 (totem label) with other
        // spells, index those too. This links totem placements to their effects
        // (e.g. Capacitor Totem 192058 → stun 118905).
        if (totemLabelSpellIds.has(spellId)) {
          totemLabelSpellIds.forEach((labeledId) => {
            if (labeledId !== spellId && !idsToIndex.includes(labeledId)) {
              idsToIndex.push(labeledId);
            }
          });
        }
        // If this talent spell's description references other spell IDs via
        // $SPELLIDd (duration), index those too. This links talent casters to
        // their CC effects (e.g. Binding Shot 109248 → stun 117526).
        const descRefs = descriptionRefMap.get(spellId);
        if (descRefs) {
          descRefs.forEach((refId) => {
            if (!idsToIndex.includes(refId)) {
              idsToIndex.push(refId);
            }
          });
        }

        for (const id of idsToIndex) {
          const existingSpell = talentSpellMap.get(id) ?? new Set<number>();
          existingSpell.add(specId);
          talentSpellMap.set(id, existingSpell);
        }

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

  // ── 6b. Build pet ability → specIds via SkillLine "Pet - ..." rows ─
  // Pet abilities (e.g. Water Elemental's Freeze, Felguard's Axe Toss) live
  // in DB2 SkillLine rows whose DisplayName_lang starts with "Pet - ".
  // They aren't in SpecializationSpells, class SkillLineAbility, or talent
  // trees — so priorities 1–3 cannot attribute them. We resolve them by
  // deriving candidate summoning-spell names from each pet SkillLine's
  // display name, looking those names up in SpellName, then routing the
  // resulting spell IDs through the already-built class sources.
  //
  // Known shortfall: Blizzard sometimes renames the summon spell away from
  // the pet's SkillLine name (e.g. Succubus → "Summon Sayaad", Ghoul →
  // "Raise Dead"). See packages/tools/docs/PET_ABILITY_RESOLUTION.md.

  // Step 1: Build name → spellIds reverse index.
  const spellIdsByName = new Map<string, Set<string>>();
  spellNamesById.forEach((name, spellId) => {
    if (!name) return;
    const key = name.toLowerCase();
    const existing = spellIdsByName.get(key) ?? new Set<string>();
    existing.add(spellId);
    spellIdsByName.set(key, existing);
  });

  // Step 2: Resolve a summon-spell candidate name to specIds using only the
  // already-built class sources (no PvP, no pet recursion).
  function resolveOwningSpecsByName(candidateName: string): Set<string> {
    const specs = new Set<string>();
    const ids = spellIdsByName.get(candidateName.toLowerCase());
    if (!ids) return specs;
    Array.from(ids).forEach((sid) => {
      specSpellMap.get(sid)?.forEach((s) => specs.add(s));
      classSpellMap.get(sid)?.forEach((classId) => {
        (specIdsByClassId.get(classId) ?? []).forEach((s) => specs.add(String(s)));
      });
      talentSpellMap.get(sid)?.forEach((specId) => specs.add(String(specId)));
    });
    return specs;
  }

  // Step 3: Derive candidate summon names from a pet DisplayName.
  function petNameCandidates(displayName: string): string[] {
    let petName = displayName.slice('Pet - '.length).trim();
    const minorSuffix = ' Minor Talent Version';
    if (petName.endsWith(minorSuffix)) {
      petName = petName.slice(0, -minorSuffix.length).trim();
    }
    const cands = new Set<string>();
    cands.add(`Summon ${petName}`);
    cands.add(`Summon ${petName}s`);
    cands.add(petName);
    cands.add(`Raise ${petName}`);
    if (petName.startsWith('Primal ')) {
      const stripped = petName.slice('Primal '.length).trim();
      cands.add(stripped);
      cands.add(`Summon ${stripped}`);
      cands.add(`Summon ${stripped}s`);
    }
    return Array.from(cands);
  }

  // Step 4: For each "Pet - ..." SkillLine, compute owning specs.
  const petSkillLineSpecs = new Map<number, Set<string>>();
  let petSkillLineCount = 0;
  for (const row of skillLineDefRows) {
    const displayName = row.DisplayName_lang || '';
    if (!displayName.startsWith('Pet - ')) continue;
    petSkillLineCount++;
    const skillLineId = toInt(row.ID);
    if (!skillLineId) continue;

    const owning = new Set<string>();
    for (const cand of petNameCandidates(displayName)) {
      resolveOwningSpecsByName(cand).forEach((s) => owning.add(s));
    }
    if (owning.size > 0) {
      petSkillLineSpecs.set(skillLineId, owning);
    }
  }

  // Step 5: Build petAbilitySpellId → Set<specId> by walking SkillLineAbility
  // rows whose SkillLine matches a resolved pet skill line (AcquireMethod>=2).
  const petAbilityMap = new Map<string, Set<string>>();
  for (const row of skillLineRows) {
    const skillLine = toInt(row.SkillLine);
    const owning = petSkillLineSpecs.get(skillLine);
    if (!owning) continue;
    const spellId = row.Spell;
    if (!spellId || spellId === '0') continue;
    if (toInt(row.AcquireMethod) < 2) continue;

    const existing = petAbilityMap.get(spellId) ?? new Set<string>();
    owning.forEach((s) => existing.add(s));
    petAbilityMap.set(spellId, existing);
  }

  console.log(
    `Built pet SkillLine index: ${petSkillLineSpecs.size}/${petSkillLineCount} pet skill lines resolved → ${petAbilityMap.size} pet abilities`,
  );

  // ── 7. Resolve each spell to its spec IDs ───────────────────────

  /**
   * Resolve a spell ID to its player spec IDs.
   * Uses only exact ID matching — no name-based fallback.
   */
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

    // Priority 4: Pet SkillLine (pet abilities owned by classes that summon them)
    const fromPetSkillLine = petAbilityMap.get(spellId);
    if (fromPetSkillLine && fromPetSkillLine.size > 0) {
      return {
        spellId,
        name,
        specIds: Array.from(fromPetSkillLine).sort((a, b) => Number(a) - Number(b)),
        source: 'PetSkillLine',
      };
    }

    // Priority 5: PvpTalent (spec-specific PvP talents)
    const fromPvpTalent = pvpTalentMap.get(spellId);
    if (fromPvpTalent && fromPvpTalent.size > 0) {
      return {
        spellId,
        name,
        specIds: Array.from(fromPvpTalent).sort((a, b) => Number(a) - Number(b)),
        source: 'PvpTalent',
      };
    }

    // Priority 6: Description reference — a parent spell's tooltip mentions
    // this spell's ID for its duration ($<spellId>d). The parent is usually
    // the caster-side cast; this spell is the applied aura whose DR flags
    // we want to attribute. Inherit specs from all parents that themselves
    // resolve via priorities 1–5.
    const parents = reverseDescriptionRefMap.get(spellId);
    if (parents && parents.size > 0) {
      const inheritedSpecs = new Set<string>();
      Array.from(parents).forEach((parentId) => {
        if (parentId === spellId) return;
        specSpellMap.get(parentId)?.forEach((s) => inheritedSpecs.add(s));
        classSpellMap.get(parentId)?.forEach((classId) => {
          (specIdsByClassId.get(classId) ?? []).forEach((s) => inheritedSpecs.add(String(s)));
        });
        talentSpellMap.get(parentId)?.forEach((s) => inheritedSpecs.add(String(s)));
        petAbilityMap.get(parentId)?.forEach((s) => inheritedSpecs.add(s));
        pvpTalentMap.get(parentId)?.forEach((s) => inheritedSpecs.add(s));
      });
      if (inheritedSpecs.size > 0) {
        return {
          spellId,
          name,
          specIds: Array.from(inheritedSpecs).sort((a, b) => Number(a) - Number(b)),
          source: 'DescriptionRef',
        };
      }
    }

    // Not found in any source
    return { spellId, name, specIds: [], source: 'unresolved' };
  }

  /**
   * Merge PvP talent spec assignments into an already-resolved entry.
   * A spell may be in the regular talent tree for some specs and a PvP
   * talent for others (e.g. Blessing of Spellwarding: Prot via talent
   * tree, Holy/Ret via PvP talent).
   */
  function mergePvpTalentSpecs(entry: SpellClassEntry): void {
    const pvpSpecs = pvpTalentMap.get(entry.spellId);
    if (!pvpSpecs || pvpSpecs.size === 0) return;
    const merged = new Set(entry.specIds);
    pvpSpecs.forEach((specId) => merged.add(specId));
    entry.specIds = Array.from(merged).sort((a, b) => Number(a) - Number(b));
  }

  function resolveCategory(spellIds: string[]): SpellClassEntry[] {
    return spellIds.map(resolveSpell);
  }

  const bigDefensive = resolveCategory(spellIdLists.bigDefensiveSpellIds);
  const externalDefensive = resolveCategory(spellIdLists.externalDefensiveSpellIds);
  const important = resolveCategory(spellIdLists.importantSpellIds);

  // Merge PvP talent specs into resolved entries (a spell can be in the
  // regular talent tree for some specs and a PvP talent for others).
  for (const entry of [...bigDefensive, ...externalDefensive, ...important]) {
    if (entry.specIds.length > 0) {
      mergePvpTalentSpecs(entry);
    }
  }

  // ── 7b. Collect unresolved curated spells for bug reporting ─────
  // Spells flagged by DB2 attributes that can't be ID-resolved to a player
  // spec, but share a name with a talent tree entry. These likely represent
  // Blizzard flagging the wrong spell ID. Recorded for bug reporting only.
  const unresolvedSpells: UnresolvedSpellEntry[] = [];
  const categoryEntries: [string, SpellClassEntry[]][] = [
    ['bigDefensive', bigDefensive],
    ['externalDefensive', externalDefensive],
    ['important', important],
  ];

  for (const [category, entries] of categoryEntries) {
    for (const entry of entries) {
      if (entry.specIds.length > 0 || !entry.name) continue;
      const byName = talentNameMap.get(entry.name.toLowerCase());
      if (byName && byName.length > 0) {
        const talentSpecIds = new Set<string>();
        const talentSpellIds = new Set<string>();
        byName.forEach((hit) => {
          talentSpecIds.add(String(hit.specId));
          talentSpellIds.add(hit.spellId);
        });
        unresolvedSpells.push({
          spellId: entry.spellId,
          name: entry.name,
          category,
          talentSpellIds: Array.from(talentSpellIds).sort((a, b) => Number(a) - Number(b)),
          talentSpecIds: Array.from(talentSpecIds).sort((a, b) => Number(a) - Number(b)),
        });
      }
    }
  }

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

  if (unresolvedSpells.length > 0) {
    console.log(
      `\n⚠ ${unresolvedSpells.length} spells have name matches in talent tree but no ID match (likely wrong spell ID in DB2):`,
    );
    for (const u of unresolvedSpells) {
      console.log(`  ${u.spellId} "${u.name}" [${u.category}] → talent IDs: ${u.talentSpellIds.join(', ')}`);
    }
  }

  // ── 8b. Resolve interrupt spells to player specs ────────────────
  const interrupts: InterruptEntry[] = [];
  for (const spellId of Array.from(interruptSpellIds)) {
    const resolved = resolveSpell(spellId);
    if (resolved.specIds.length > 0) {
      interrupts.push({
        spellId,
        name: resolved.name,
        specIds: resolved.specIds,
      });
    }
  }
  interrupts.sort((a, b) => Number(a.spellId) - Number(b.spellId));
  console.log(`\nInterrupts: ${interrupts.length} player-class spells`);
  for (const entry of interrupts) {
    console.log(`  ${entry.spellId} ${entry.name}`);
  }

  // Enrich diminishing returns entries with spec IDs and filter to player spells
  for (const [group, entries] of Object.entries(diminishingReturns)) {
    for (const entry of entries) {
      const resolved = resolveSpell(entry.spellId);
      if (resolved.specIds.length > 0) {
        entry.specIds = resolved.specIds;
      }
    }
    const playerSpells = entries.filter((e) => e.specIds && e.specIds.length > 0);
    diminishingReturns[group] = playerSpells;
    console.log(`DR group ${group}: ${playerSpells.length}/${entries.length} resolved to player specs`);
  }

  // ── 9. Write output ─────────────────────────────────────────────

  const output: IGeneratedSpellClassMap = {
    generatedAt: new Date().toISOString(),
    wagoBuild: WAGO_BUILD,
    sources: {
      chrSpecializationCsv: SOURCE_TABLES.chrSpecialization,
      specializationSpellsCsv: SOURCE_TABLES.specializationSpells,
      skillLineAbilityCsv: SOURCE_TABLES.skillLineAbility,
      pvpTalentCsv: SOURCE_TABLES.pvpTalent,
      spellNameCsv: SOURCE_TABLES.spellName,
      spellCategoriesCsv: SOURCE_TABLES.spellCategories,
      spellEffectCsv: SOURCE_TABLES.spellEffect,
      spellLabelCsv: SOURCE_TABLES.spellLabel,
      spellCsv: SOURCE_TABLES.spell,
      skillLineCsv: SOURCE_TABLES.skillLine,
      spellIdListsJson: 'packages/shared/src/data/spellIdLists.json',
      talentIdMapJson: 'packages/shared/src/data/talentIdMap.json',
    },
    bigDefensive,
    externalDefensive,
    important,
    diminishingReturns,
    interrupts,
    unresolvedSpells,
  };

  const outputPath = path.resolve(__dirname, '../../shared/src/data/spellClassMap.json');
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nWrote spell class map to ${outputPath}`);
}

main();
