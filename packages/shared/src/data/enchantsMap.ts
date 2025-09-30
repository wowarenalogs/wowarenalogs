// See
// https://www.raidbots.com/static/data/live/enchantments.json
import coreData from './raidbotsEnchantments.json';

export type RaidbotsEnchantsData = RaidbotsEnchant[];

export type RaidbotsEnchant = {
  id: number;
  displayName: string;
  spellId?: number;
  spellIcon: string;
  tokenizedName: string;
  equipRequirements?: {
    itemClass: number;
    itemSubClassMask: number;
    invTypeMask: number;
  };
  categoryId?: number;
  categoryName?: string;
  itemId?: number;
  itemName?: string;
  itemIcon?: string;
  quality?: number;
  expansion?: number;
  slot?: string;
  socketType?: string;
  stats?: {
    type: string;
    amount: number;
  }[];
  itemLimitCategory?: {
    id: number;
    name: string;
    quantity: number;
    flags: number;
    hotfixed?: boolean;
  };
  unique?: number;
  craftingQuality?: number;
  baseDisplayName?: string;
};

/** These are not in the raidbots dump */
const manualAdditions: RaidbotsEnchant[] = [
  {
    id: 5401,
    displayName: 'Windfury Weapon',
    tokenizedName: 'windfury_weapon',
    spellIcon: 'spell_windfury_weapon',
    spellId: 334302,
  },
  {
    id: 5400,
    displayName: 'Flametongue Weapon',
    tokenizedName: 'flametongue_weapon',
    spellIcon: 'spell_flametongue_weapon',
    spellId: 334294,
  },
];

export const enchantsData: RaidbotsEnchantsData = [...manualAdditions, ...coreData];

export const enchantsMap = enchantsData.reduce(
  (prev, cur) => {
    prev[cur.id.toString()] = cur;
    return prev;
  },
  {} as Record<string, RaidbotsEnchant>,
);
