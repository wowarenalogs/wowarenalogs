import { CombatUnitSpec } from '@wowarenalogs/parser';

import spellClassMap from '../../../data/spellClassMap.json';

export type MistakeSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export type MistakeDetectionType =
  | 'offensive_cd_into_immunity'
  | 'died_without_defensive'
  | 'trinket_low_value_cc'
  | 'cc_dr_overlap'
  | 'damage_into_immunity';

/**
 * Describes a detectable mistake pattern. Each rule is checked by the
 * analysis engine against the combat log events.
 */
export interface MistakeRule {
  id: string;
  title: string;
  severity: MistakeSeverity;
  tip: string;
  detection: MistakeDetectionType;
}

// ── Spell ID constants ──────────────────────────────────────────────

/** Major offensive cooldowns by spec. Using these into an immune target is a mistake. */
export const OFFENSIVE_CDS: Record<string, string[]> = {
  // Rogue
  [CombatUnitSpec.Rogue_Subtlety]: ['121471'], // Shadow Blades
  [CombatUnitSpec.Rogue_Assassination]: ['79140'], // Vendetta / Deathmark
  [CombatUnitSpec.Rogue_Outlaw]: ['13750'], // Adrenaline Rush

  // Mage
  [CombatUnitSpec.Mage_Fire]: ['190319'], // Combustion
  [CombatUnitSpec.Mage_Frost]: ['12472'], // Icy Veins
  [CombatUnitSpec.Mage_Arcane]: ['365350'], // Arcane Surge

  // Warrior
  [CombatUnitSpec.Warrior_Arms]: ['1719'], // Recklessness (Avatar for Arms is 107574)
  [CombatUnitSpec.Warrior_Fury]: ['1719'], // Recklessness

  // Paladin
  [CombatUnitSpec.Paladin_Retribution]: ['31884'], // Avenging Wrath

  // Death Knight
  [CombatUnitSpec.DeathKnight_Frost]: ['51271'], // Pillar of Frost
  [CombatUnitSpec.DeathKnight_Unholy]: ['275699'], // Apocalypse

  // Demon Hunter
  [CombatUnitSpec.DemonHunter_Havoc]: ['191427'], // Metamorphosis (Havoc)

  // Hunter
  [CombatUnitSpec.Hunter_BeastMastery]: ['19574'], // Bestial Wrath
  [CombatUnitSpec.Hunter_Marksmanship]: ['288613'], // Trueshot
  [CombatUnitSpec.Hunter_Survival]: ['360966'], // Coordinated Assault / Spearhead

  // Warlock
  [CombatUnitSpec.Warlock_Affliction]: ['205180'], // Summon Darkglare
  [CombatUnitSpec.Warlock_Destruction]: ['1122'], // Summon Infernal
  [CombatUnitSpec.Warlock_Demonology]: ['265187'], // Summon Demonic Tyrant

  // Shaman
  [CombatUnitSpec.Shaman_Elemental]: ['191634'], // Stormkeeper
  [CombatUnitSpec.Shaman_Enhancement]: ['114051'], // Ascendance

  // Priest
  [CombatUnitSpec.Priest_Shadow]: ['228260'], // Void Eruption / Dark Ascension

  // Druid
  [CombatUnitSpec.Druid_Balance]: ['194223'], // Celestial Alignment
  [CombatUnitSpec.Druid_Feral]: ['106951'], // Berserk

  // Monk
  [CombatUnitSpec.Monk_Windwalker]: ['137639'], // Storm, Earth, and Fire

  // Evoker
  [CombatUnitSpec.Evoker_Devastation]: ['375087'], // Dragonrage
};

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

/** CC DR categories. CC in the same category within 18s = DR overlap. */
export const DR_CATEGORIES: Record<string, Set<string>> = {
  stun: new Set([
    '408', // Kidney Shot
    '1833', // Cheap Shot
    '853', // Hammer of Justice
    '179057', // Chaos Nova
    '89766', // Storm Bolt
    '91797', // Monstrous Blow (Ghoul)
    '30283', // Shadowfury
    '211881', // Fel Eruption
    '119381', // Leg Sweep
    '221562', // Asphyxiate
    '204399', // Earthfury (Shaman talent)
    '5211', // Mighty Bash
    '163505', // Rake (from stealth, stun component)
    '203123', // Maim
  ]),
  incapacitate: new Set([
    '6770', // Sap
    '118', // Polymorph
    '51514', // Hex
    '2637', // Hibernate
    '20066', // Repentance
    '3355', // Freezing Trap
    '6358', // Seduction
    '115078', // Paralysis
    '217832', // Imprison
    '605', // Dominate Mind / Mind Control
    '710', // Banish
    '2094', // Blind
    '1776', // Gouge
    '107079', // Quaking Palm
    '82691', // Ring of Frost
    '28272', // Pig Poly
    '28271', // Turtle Poly
    '161354', // Monkey Poly
    '161353', // Polar Bear Poly
    '61305', // Cat Poly
    '61025', // Penguin Poly
    '61721', // Rabbit Poly
    '277787', // Bumblebee Poly
    '277792', // Direhorn Poly
    '391622', // Polymorph (Duck)
  ]),
  disorient: new Set([
    '5782', // Fear
    '5484', // Howl of Terror
    '8122', // Psychic Scream
    '31661', // Dragon's Breath
    '207167', // Blinding Sleet
    '5246', // Intimidating Shout
    '33786', // Cyclone
    '209753', // Cyclone (Honor talent)
    '360806', // Sleep Walk (Evoker)
    '198898', // Song of Chi-Ji
    '202274', // Incapacitating Roar
  ]),
};

// ── Per-spec mistake rules ──────────────────────────────────────────

/**
 * Returns the set of mistake rules relevant to a given spec.
 * Every spec gets the universal rules plus spec-specific ones.
 */
export function getMistakeRulesForSpec(spec: CombatUnitSpec): MistakeRule[] {
  const rules: MistakeRule[] = [];

  // Universal rules that apply to everyone
  rules.push({
    id: 'damage_into_immunity',
    title: 'Dealt damage into an immune target',
    severity: 'HIGH',
    tip: 'Attacking a target with Divine Shield, Ice Block, or Aspect of the Turtle wastes your GCDs. Swap targets or wait for the immunity to expire.',
    detection: 'damage_into_immunity',
  });

  rules.push({
    id: 'trinket_low_value_cc',
    title: 'Trinket used on low-value CC',
    severity: 'MEDIUM',
    tip: 'Sap and Gouge break on damage and have short durations. Save your trinket for stuns during kill attempts or CC chains that threaten lethal.',
    detection: 'trinket_low_value_cc',
  });

  rules.push({
    id: 'cc_dr_overlap',
    title: 'CC applied into diminishing returns',
    severity: 'MEDIUM',
    tip: 'Applying CC from the same DR category within 18 seconds halves its duration. Chain CC from different DR categories instead.',
    detection: 'cc_dr_overlap',
  });

  // Spec-specific: offensive CD into immunity
  if (OFFENSIVE_CDS[spec]) {
    rules.push({
      id: 'offensive_cd_into_immunity',
      title: 'Major offensive cooldown used while target was immune',
      severity: 'HIGH',
      tip: 'Your primary burst cooldown was activated while your target had an active immunity. This wastes a key cooldown. Verify defensives are down before committing burst.',
      detection: 'offensive_cd_into_immunity',
    });
  }

  // Spec-specific: died without using defensives
  if (DEFENSIVE_CDS[spec]) {
    rules.push({
      id: 'died_without_defensive',
      title: 'Died without using a major defensive cooldown',
      severity: 'HIGH',
      tip: 'You died in this match without ever activating one of your major defensive cooldowns. These abilities exist to prevent exactly this outcome.',
      detection: 'died_without_defensive',
    });
  }

  return rules;
}
