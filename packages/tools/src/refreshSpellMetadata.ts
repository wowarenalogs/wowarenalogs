/* eslint-disable no-console */
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

import spellIdLists from '../../shared/src/data/spellIdLists.json';
import manualSpells from './spellMetadataManual.json';
import { WAGO_BUILD, withBuild } from './wagoConfig';

type SpellMetadata = Record<string, unknown> & { type: string };

// SpellDiminish ids; SpellCategories.DiminishType is a bitmask of 1 << (id - 1)
const DR_ROOT = 1 << 0;
const DR_CC = (1 << 2) | (1 << 4) | (1 << 5) | (1 << 6); // stun, incapacitate, disorient, silence
const EFFECT_INTERRUPT_CAST = 68;
const SKILL_LINE_CATEGORY_CLASS = '7';

// Parses a wago CSV, keeping only the named columns to bound memory on large tables
function parseCsv(csv: string, columns: string[]): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (char === '"') {
      if (inQuotes && csv[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && (char === ',' || char === '\n')) {
      row.push(field);
      field = '';
      if (char === '\n') {
        rows.push(row);
        row = [];
      }
    } else if (inQuotes || char !== '\r') {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const indexes = columns.map((c) => rows[0].indexOf(c));
  const missing = columns.filter((_c, i) => indexes[i] < 0);
  if (missing.length) {
    throw new Error(`CSV is missing columns: ${missing.join(', ')}`);
  }
  return rows.slice(1).map((r) => indexes.map((i) => r[i] ?? ''));
}

async function loadTable(table: string, columns: string[]): Promise<string[][]> {
  const response = await fetch(withBuild(table));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${table}: ${response.status} ${response.statusText}`);
  }
  return parseCsv(await response.text(), columns);
}

async function main() {
  console.log(`Downloading spell tables from wago.tools (build=${WAGO_BUILD})`);
  const [
    spellNames,
    categories,
    effects,
    skillLines,
    skillLineTrees,
    skillLineAbilities,
    traitNodes,
    traitNodeEntryLinks,
    traitNodeEntries,
    traits,
    pvpTalents,
  ] = await Promise.all([
    loadTable('SpellName', ['ID', 'Name_lang']),
    loadTable('SpellCategories', ['SpellID', 'DifficultyID', 'DiminishType']),
    loadTable('SpellEffect', ['SpellID', 'DifficultyID', 'Effect', 'EffectTriggerSpell']),
    loadTable('SkillLine', ['ID', 'CategoryID']),
    loadTable('SkillLineXTraitTree', ['SkillLineID', 'TraitTreeID']),
    loadTable('SkillLineAbility', ['SkillLine', 'Spell']),
    loadTable('TraitNode', ['ID', 'TraitTreeID']),
    loadTable('TraitNodeXTraitNodeEntry', ['TraitNodeID', 'TraitNodeEntryID']),
    loadTable('TraitNodeEntry', ['ID', 'TraitDefinitionID']),
    loadTable('TraitDefinition', ['ID', 'SpellID', 'OverridesSpellID', 'VisibleSpellID']),
    loadTable('PvpTalent', ['SpellID']),
  ]);
  const names = new Map(spellNames.map(([id, name]) => [id, name] as [string, string]));

  // Class spellbooks, class talent trees and PvP talents, plus whatever those trigger.
  // Skips NPC copies and legacy pets, covenants and world-content traits.
  const treeSkillLines = new Set(skillLineTrees.map(([line]) => line));
  const classSkillLines = new Set(
    skillLines.filter(([id, c]) => c === SKILL_LINE_CATEGORY_CLASS && treeSkillLines.has(id)).map(([id]) => id),
  );
  const classTrees = new Set(skillLineTrees.filter(([line]) => classSkillLines.has(line)).map(([, tree]) => tree));
  const classNodes = new Set(traitNodes.filter(([, tree]) => classTrees.has(tree)).map(([id]) => id));
  const classEntries = new Set(traitNodeEntryLinks.filter(([node]) => classNodes.has(node)).map(([, entry]) => entry));
  const classTraits = new Set(traitNodeEntries.filter(([id]) => classEntries.has(id)).map(([, trait]) => trait));
  const learnable = new Set<string>([
    ...skillLineAbilities.filter(([line]) => classSkillLines.has(line)).map(([, spell]) => spell),
    ...traits.filter(([id]) => classTraits.has(id)).reduce<string[]>((ids, [, ...spells]) => ids.concat(spells), []),
    ...pvpTalents.map(([id]) => id),
  ]);
  learnable.delete('0');
  const triggers = new Map<string, string[]>();
  const interrupts = new Set<string>();
  effects.forEach(([spellId, difficulty, effect, trigger]) => {
    if (difficulty !== '0') return;
    if (trigger !== '0') triggers.set(spellId, (triggers.get(spellId) || []).concat(trigger));
    if (Number(effect) === EFFECT_INTERRUPT_CAST) interrupts.add(spellId);
  });
  let frontier = Array.from(learnable);
  for (let depth = 0; depth < 3; depth += 1) {
    frontier = frontier.flatMap((id) => triggers.get(id) || []).filter((id) => !learnable.has(id));
    frontier.forEach((id) => learnable.add(id));
  }

  const generated: Record<string, SpellMetadata> = {};
  const tag = (spellId: string, type: string) => {
    if (learnable.has(spellId) && names.has(spellId) && !generated[spellId]) generated[spellId] = { type };
  };
  interrupts.forEach((id) => tag(id, 'interrupts'));
  categories.forEach(([spellId, difficulty, diminish]) => {
    if (difficulty !== '0') return;
    if (Number(diminish) & DR_CC) tag(spellId, 'cc');
    else if (Number(diminish) & DR_ROOT) tag(spellId, 'roots');
  });
  spellIdLists.externalOrBigDefensiveSpellIds.forEach((id) => tag(id, 'buffs_defensive'));

  // Hand-curated entries (seeded from BigDebuffs) win over generated tags
  const redundant = Object.keys(manualSpells.spells).filter(
    (id) =>
      generated[id] &&
      JSON.stringify(generated[id]) === JSON.stringify((manualSpells.spells as Record<string, SpellMetadata>)[id]),
  );
  if (redundant.length) {
    console.log(`Curated entries wago already covers, safe to remove: ${redundant.join(', ')}`);
  }
  const excluded = new Set(Object.keys(manualSpells.exclude));
  const spells: Record<string, SpellMetadata> = {};
  const merged: Record<string, SpellMetadata> = {
    ...generated,
    ...(manualSpells.spells as Record<string, SpellMetadata>),
  };
  Object.keys(merged).forEach((id) => {
    if (names.has(id) && !excluded.has(id)) spells[id] = merged[id];
  });

  const outputPath = path.resolve(__dirname, '../../shared/src/data/spells.json');
  const previous: Record<string, SpellMetadata> = await fs.readJson(outputPath);
  const describe = (id: string, type: string) => `  ${id} ${names.get(id) || '?'} (${type})`;
  const added = Object.keys(spells).filter((id) => !previous[id]);
  const retyped = Object.keys(spells).filter((id) => previous[id] && previous[id].type !== spells[id].type);
  const dropped = Object.keys(previous).filter((id) => !spells[id]);
  console.log(`Added ${added.length}:\n${added.map((id) => describe(id, spells[id].type)).join('\n')}`);
  console.log(
    `Retyped ${retyped.length}:\n${retyped
      .map((id) => describe(id, `${previous[id].type} -> ${spells[id].type}`))
      .join('\n')}`,
  );
  console.log(`Dropped ${dropped.length}:\n${dropped.map((id) => describe(id, previous[id].type)).join('\n')}`);

  await fs.writeFile(outputPath, JSON.stringify(spells, null, 2));
}

main();
