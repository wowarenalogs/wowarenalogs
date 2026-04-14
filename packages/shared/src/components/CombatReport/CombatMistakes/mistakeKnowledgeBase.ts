import spellClassMap from '../../../data/spellClassMap.json';
import { spells } from '../../../data/spellTags';

export type MistakeSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

/** Spell ID → name lookup built from all spellClassMap categories. */
export const SPELL_NAMES: Map<string, string> = (() => {
  const map = new Map<string, string>();
  const allEntries = [
    ...spellClassMap.bigDefensive,
    ...spellClassMap.externalDefensive,
    ...spellClassMap.important,
    ...spellClassMap.interrupts,
    ...Object.values(spellClassMap.diminishingReturns).flat(),
  ];
  for (const entry of allEntries) {
    if (entry.spellId && entry.name && !map.has(entry.spellId)) {
      map.set(entry.spellId, entry.name);
    }
  }
  return map;
})();

// ── Spell ID constants ──────────────────────────────────────────────

/**
 * Major defensive cooldowns by spec, derived from spellClassMap.json (bigDefensive category).
 * Inverted from the generated per-spell → specIds mapping into per-spec → spellIds.
 */
export const DEFENSIVE_CDS: Record<string, string[]> = (() => {
  const bySpec: Record<string, string[]> = {};
  for (const entry of spellClassMap.bigDefensive) {
    for (const specId of entry.specIds) {
      if (!bySpec[specId]) bySpec[specId] = [];
      bySpec[specId].push(entry.spellId);
    }
  }
  return bySpec;
})();

/** Immunity spell IDs — attacking into these is always a waste. */
export const IMMUNITY_SPELL_IDS = new Set<string>([
  '642', // Divine Shield
  '45438', // Ice Block
  '186265', // Aspect of the Turtle
  '710', // Banish (on demon target)
  '46924', // Bladestorm (partial, breaks on stun)
  '31224', // Cloak of Shadows (magic only)
]);

/** Full immunity aura spell IDs that mean the target cannot take damage. */
export const FULL_IMMUNITY_AURA_IDS = new Set<string>([
  '642', // Divine Shield
  '45438', // Ice Block
  '186265', // Aspect of the Turtle
  '33786', // Cyclone
]);

/** PvP Trinket spell ID (used for trinket waste detection). */
export const TRINKET_SPELL_ID = '336126';

/** Low-value CC that shouldn't be trinketed (short or breaks on damage). */
export const LOW_VALUE_CC_SPELL_IDS = new Set<string>([
  '6770', // Sap
  '1776', // Gouge
  '1330', // Garrote Silence
]);

/** Interrupt (kick) spell IDs derived from spellClassMap.json. */
export const INTERRUPT_SPELL_IDS = new Set<string>(spellClassMap.interrupts.map((e: { spellId: string }) => e.spellId));

/** Offensive buff aura IDs from BigDebuffs (type === 'buffs_offensive'). */
export const OFFENSIVE_BUFF_IDS = new Set<string>(
  Object.keys(spells).filter((id) => spells[id].type === 'buffs_offensive'),
);

/** Defensive buff aura IDs from BigDebuffs (type === 'buffs_defensive'). */
export const DEFENSIVE_BUFF_IDS = new Set<string>(
  Object.keys(spells).filter((id) => spells[id].type === 'buffs_defensive'),
);

/** CC DR categories derived from spellClassMap.json (SpellCategories.DiminishType). */
export const DR_CATEGORIES: Record<string, Set<string>> = (() => {
  const RELEVANT_CATEGORIES = ['stun', 'incapacitate', 'disorient'];
  const result: Record<string, Set<string>> = {};
  for (const cat of RELEVANT_CATEGORIES) {
    const entries =
      (spellClassMap.diminishingReturns as Record<string, { spellId: string; name: string }[]>)[cat] ?? [];
    result[cat] = new Set(entries.map((e: { spellId: string }) => e.spellId));
  }
  return result;
})();
