import spellClassMap from '../../../data/spellClassMap.json';

export type MistakeSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

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
]);

/** PvP Trinket spell ID (used for trinket waste detection). */
export const TRINKET_SPELL_ID = '336126';

/** Low-value CC that shouldn't be trinketed (short or breaks on damage). */
export const LOW_VALUE_CC_SPELL_IDS = new Set<string>([
  '6770', // Sap
  '1776', // Gouge
  '1330', // Garrote Silence
]);

/**
 * CC DR categories derived from spellClassMap.json (SpellCategories.DiminishType)
 * with manual overrides for spells missing from the DB.
 */
export const DR_CATEGORIES: Record<string, Set<string>> = (() => {
  // Only the PvP-relevant categories
  const RELEVANT_CATEGORIES = ['stun', 'incapacitate', 'disorient'];
  const result: Record<string, Set<string>> = {};
  for (const cat of RELEVANT_CATEGORIES) {
    const entries = spellClassMap.diminishingReturns[cat] ?? [];
    result[cat] = new Set(entries.map((e: { spellId: string }) => e.spellId));
  }

  // Manual overrides: spells with DiminishType=0 in SpellCategories
  // that are known to share DR in PvP.
  result['stun'].add('204399'); // Earthfury (Shaman talent)
  result['disorient'].add('5782'); // Fear
  result['disorient'].add('209753'); // Cyclone (Honor talent)
  result['disorient'].add('198898'); // Song of Chi-Ji

  return result;
})();
