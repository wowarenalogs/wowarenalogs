import { CombatUnitClass, CombatUnitSpec, ICombatUnit } from 'wow-combat-log-parser';

import { classData } from './classdata';

export enum SpellTag {
  Control = 'Control',
  Offensive = 'Offensive',
  Defensive = 'Defensive',
}

export const SPELL_TAG_PRIORITY = {
  [SpellTag.Control]: 1,
  [SpellTag.Offensive]: 2,
  [SpellTag.Defensive]: 3,
};

type Charges = {
  /** Max number of charges the spell can store */
  max: number;
  /** Cooldown to regenerate a single charge */
  cooldownSeconds: number;
};

type Spell = {
  /** Spells not associated with a class will have this as true, false otherwise */
  generic: boolean;
  /** Specializations associated with this spell */
  associatedSpecs: CombatUnitSpec[];
  /** spellId from db */
  id: string;
  /** spellName from db */
  name: string;
  /** Cooldown in seconds if spell has a cooldown */
  cooldownSeconds?: number;
  /** If spell has charges, how many and how fast do they recover */
  charges?: Charges;
  /** Duration of aura applied, if any (optional) */
  durationSeconds?: number;
  /** Tags used to categorize and prioritize spells */
  tags: SpellTag[];
};

// All spells must be considered in the context of the player casting them
function contextualSpells(spellsFromDb: Spell[], player: ICombatUnit): Spell[] {
  return spellsFromDb;
}

const spellsFromDb: Spell[] = []; // getFromDb(...)

const player: ICombatUnit = {} as ICombatUnit; // combat.players[i]

const spellsForUnit = contextualSpells(spellsFromDb, player);

// Somewhere we must also store a list of spells to show during replay (awcSpells)
function getAwcSpells(spells: Spell[], player: ICombatUnit): Spell[] {
  return [];
}
const spellsToShow = getAwcSpells(spellsFromDb, player);

export {};

// Class Definition File

type SpellMorpher = {
  predicate: (u: ICombatUnit) => boolean;
  morphInPlace: (spells: Spell[]) => Spell[];
};

export type SpecInfo = {
  specialization: CombatUnitSpec;
  awcSpellIds: string[];
  talentMods: SpellMorpher[];
};

export type ClassInfo = {
  specInfo: SpecInfo[];
};

// DEFs
export const specSpellInfo: Record<CombatUnitSpec, SpecInfo> = {};

classData.forEach((c) =>
  c.forEach((d) => {
    specSpellInfo[d.specialization] = d;
  }),
);

export function unitHasPvpTalent(unit: ICombatUnit, talentId: string) {
  return Boolean(unit.info?.pvpTalents.includes(talentId));
}
