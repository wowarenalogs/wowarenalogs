import { ArenaMatchEnd } from './actions/ArenaMatchEnd';
import { ArenaMatchStart } from './actions/ArenaMatchStart';
import { CombatAction } from './actions/CombatAction';
import { CombatantInfoAction } from './actions/CombatantInfoAction';

export type WowVersion = 'tbc' | 'dragonflight';

export enum LogEvent {
  ARENA_MATCH_START = 'ARENA_MATCH_START',
  ARENA_MATCH_END = 'ARENA_MATCH_END',
  COMBATANT_INFO = 'COMBATANT_INFO',
  SWING_MISSED = 'SWING_MISSED',
  RANGE_MISSED = 'RANGE_MISSED',
  SPELL_MISSED = 'SPELL_MISSED',
  SPELL_PERIODIC_MISSED = 'SPELL_PERIODIC_MISSED',
  DAMAGE_SHIELD_MISSED = 'DAMAGE_SHIELD_MISSED',
  SPELL_CAST_SUCCESS = 'SPELL_CAST_SUCCESS',
  SPELL_CAST_START = 'SPELL_CAST_START',
  SPELL_CAST_FAILED = 'SPELL_CAST_FAILED',
  SPELL_AURA_APPLIED = 'SPELL_AURA_APPLIED',
  SPELL_AURA_REMOVED = 'SPELL_AURA_REMOVED',
  SPELL_STOLEN = 'SPELL_STOLEN',
  SPELL_INTERRUPT = 'SPELL_INTERRUPT',
  SPELL_DISPEL = 'SPELL_DISPEL',
  SPELL_DISPEL_FAILED = 'SPELL_DISPEL_FAILED',
  SPELL_EXTRA_ATTACKS = 'SPELL_EXTRA_ATTACKS',
  SPELL_AURA_APPLIED_DOSE = 'SPELL_AURA_APPLIED_DOSE',
  SPELL_AURA_REMOVED_DOSE = 'SPELL_AURA_REMOVED_DOSE',
  SPELL_AURA_REFRESH = 'SPELL_AURA_REFRESH',
  SPELL_AURA_BROKEN = 'SPELL_AURA_BROKEN',
  SPELL_AURA_BROKEN_SPELL = 'SPELL_AURA_BROKEN_SPELL',
  SWING_DAMAGE = 'SWING_DAMAGE',
  SWING_DAMAGE_LANDED = 'SWING_DAMAGE_LANDED',
  ENVIRONMENTAL_DAMAGE = 'ENVIRONMENTAL_DAMAGE',
  RANGE_DAMAGE = 'RANGE_DAMAGE',
  SPELL_DAMAGE = 'SPELL_DAMAGE',
  SPELL_PERIODIC_DAMAGE = 'SPELL_PERIODIC_DAMAGE',
  DAMAGE_SHIELD = 'DAMAGE_SHIELD',
  SPELL_SUMMON = 'SPELL_SUMMON',
  SPELL_DRAIN = 'SPELL_DRAIN',
  SPELL_PERIODIC_DRAIN = 'SPELL_PERIODIC_DRAIN',
  SPELL_LEECH = 'SPELL_LEECH',
  SPELL_PERIODIC_LEECH = 'SPELL_PERIODIC_LEECH',
  SPELL_HEAL = 'SPELL_HEAL',
  SPELL_PERIODIC_HEAL = 'SPELL_PERIODIC_HEAL',
  SPELL_ENERGIZE = 'SPELL_ENERGIZE',
  SPELL_PERIODIC_ENERGIZE = 'SPELL_PERIODIC_ENERGIZE',
  SPELL_ABSORBED = 'SPELL_ABSORBED',
  DAMAGE_SPLIT = 'DAMAGE_SPLIT',
  UNIT_DIED = 'UNIT_DIED',
}

export type CombatEvent = ArenaMatchStart | ArenaMatchEnd | CombatAction | CombatantInfoAction;

export interface ICombatEventSegment {
  events: CombatEvent[];
  lines: string[];
}

export enum CombatResult {
  Unknown,
  DrawGame,
  Lose,
  Win,
}

export interface ILogLine {
  id: string;
  timestamp: number;
  event: LogEvent;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters: any[];
  raw: string;
}

export enum CombatUnitReaction {
  Neutral,
  Friendly,
  Hostile,
}

export enum CombatUnitType {
  None,
  Player,
  Pet,
}

export enum CombatUnitClass {
  None,
  Warrior,
  Hunter,
  Shaman,
  Paladin,
  Warlock,
  Priest,
  Rogue,
  Mage,
  Druid,
  DeathKnight,
  DemonHunter,
  Monk,
  Evoker,
}

export enum CombatUnitSpec {
  None = '0',
  DeathKnight_Blood = '250',
  DeathKnight_Frost = '251',
  DeathKnight_Unholy = '252',
  DemonHunter_Havoc = '577',
  DemonHunter_Vengeance = '581',
  Druid_Balance = '102',
  Druid_Feral = '103',
  Druid_Guardian = '104',
  Druid_Restoration = '105',
  Hunter_BeastMastery = '253',
  Hunter_Marksmanship = '254',
  Hunter_Survival = '255',
  Mage_Arcane = '62',
  Mage_Fire = '63',
  Mage_Frost = '64',
  Monk_BrewMaster = '268',
  Monk_Windwalker = '269',
  Monk_Mistweaver = '270',
  Paladin_Holy = '65',
  Paladin_Protection = '66',
  Paladin_Retribution = '70',
  Priest_Discipline = '256',
  Priest_Holy = '257',
  Priest_Shadow = '258',
  Rogue_Assassination = '259',
  Rogue_Outlaw = '260',
  Rogue_Subtlety = '261',
  Shaman_Elemental = '262',
  Shaman_Enhancement = '263',
  Shaman_Restoration = '264',
  Warlock_Affliction = '265',
  Warlock_Demonology = '266',
  Warlock_Destruction = '267',
  Warrior_Arms = '71',
  Warrior_Fury = '72',
  Warrior_Protection = '73',
}

export enum CombatUnitPowerType {
  HealthCost = '-2',
  None = '-1',
  Mana = '0',
  Rage = '1',
  Focus = '2',
  Energy = '3',
  ComboPoints = '4',
  Runes = '5',
  RunicPower = '6',
  SoulShards = '7',
  LunarPower = '8',
  HolyPower = '9',
  Alternate = '10',
  Maelstrom = '11',
  Chi = '12',
  Insanity = '13',
  Obsolete = '14',
  Obsolete2 = '15',
  ArcaneCharges = '16',
  Fury = '17',
  Pain = '18',
  NumPowerTypes = '19',
}

export interface EquippedItem {
  bonuses: string[];
  enchants: string[];
  gems: string[];
  id: string;
  ilvl: number;
}

export interface CombatantInfo {
  teamId: string;
  strength: number;
  agility: number;
  stamina: number;
  intelligence: number;
  dodge: number;
  parry: number;
  block: number;
  critMelee: number;
  critRanged: number;
  critSpell: number;
  speed: number;
  lifesteal: number;
  hasteMelee: number;
  hasteRanged: number;
  hasteSpell: number;
  avoidance: number;
  mastery: number;
  versatilityDamgeDone: number;
  versatilityHealingDone: number;
  versatilityDamageTaken: number;
  armor: number;
  specId: string;
  talents: [number, number, number][];
  pvpTalents: string[];
  equipment: EquippedItem[];
  interestingAurasJSON: string;
  item28: number;
  item29: number;
  personalRating: number;
  highestPvpTier: number;
}

export interface ICombatantMetadata {
  class: CombatUnitClass;
  spec: CombatUnitSpec;
  info: CombatantInfo;
}
