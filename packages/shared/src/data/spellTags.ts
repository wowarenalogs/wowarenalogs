import rawSpellsData from './spells.json';

interface ISpellMetadata {
  type:
    | 'cc'
    | 'roots'
    | 'immunities'
    | 'buffs_offensive'
    | 'buffs_defensive'
    | 'buffs_other'
    | 'debuffs_offensive'
    | 'debuffs_defensive'
    | 'debuffs_other'
    | 'interrupts';
  duration?: number;
  priority?: boolean;
}

const PRIORITY_MAP = {
  immunities: 1,
  cc: 2,
  buffs_defensive: 3,
  debuffs_defensive: 4,
  roots: 5,
  interrupts: 6,
  buffs_offensive: 7,
  debuffs_offensive: 8,
  buffs_other: 9,
  debuffs_other: 10,
};

const spells = rawSpellsData as Record<string, ISpellMetadata>;

export const ccSpellIds = new Set<string>(Object.keys(spells).filter((spellId) => spells[spellId].type === 'cc'));

export const trinketSpellIds = ['336126']; // TODO: Add adaptation spell id here

export const spellIdToPriority = new Map<string, number>(
  Object.keys(spells).map((spellId) => [spellId, PRIORITY_MAP[spells[spellId].type]]),
);
