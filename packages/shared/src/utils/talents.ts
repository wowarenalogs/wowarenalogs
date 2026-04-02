import _ from 'lodash';

import { nodeMaps } from '../components/CombatReport/CombatPlayers/talentStrings';
import talentIdMap from '../data/talentIdMap.json';

type HeroTalent = {
  id: number;
  type: string;
  name: string;
  traitSubTreeId: number;
  traitTreeId: number;
  atlasMemberName: string;
  nodes: number[];
};

const heroTalentMap = talentIdMap
  .flatMap((a) => a.subTreeNodes)
  .flatMap((n) => n.entries)
  .reduce(
    (prev, cur) => {
      prev[cur.id] = cur;
      return prev;
    },
    {} as Record<number, HeroTalent>,
  );

export const findHeroTalent = _.memoize((talents: ({ id2: number } | null)[]): HeroTalent | null => {
  const heroTalentId = talents.find((e) => e && Object.keys(heroTalentMap).includes(`${e.id2}`));
  return heroTalentId ? heroTalentMap[heroTalentId.id2] : null;
});

/**
 * Returns the set of spell IDs the player actually has from their talent tree.
 * For choice nodes, only the chosen entry's spell is included.
 * Returns null if talent data is unavailable (no filtering should be applied).
 */
export function getPlayerTalentedSpellIds(
  specId: number,
  talents: ({ id1: number; id2: number; count: number } | null)[],
): Set<string> | null {
  const specData = nodeMaps[specId];
  if (!specData) return null;

  const result = new Set<string>();

  for (const talent of talents) {
    if (!talent || talent.count === 0) continue;

    const node =
      specData.classNodeMap[talent.id1] ?? specData.specNodeMap[talent.id1] ?? specData.heroNodeMap[talent.id1];

    if (!node) continue;

    if ((node.type === 'choice' || node.type === 'subtree') && talent.id2 > 0) {
      // Choice node — only the chosen entry is active
      const entry = node.entries.find((e) => e.id === talent.id2);
      if (entry && 'spellId' in entry && entry.spellId) {
        result.add(entry.spellId.toString());
      }
    } else {
      // Single (or ranked) node — all entries are active
      for (const entry of node.entries) {
        if ('spellId' in entry && entry.spellId) {
          result.add(entry.spellId.toString());
        }
      }
    }
  }

  return result;
}

/**
 * Returns the set of all spell IDs that exist anywhere in the given spec's talent tree.
 * Used to distinguish talent-gated spells from baseline spells.
 */
export const getSpecTalentTreeSpellIds = _.memoize((specId: number): Set<string> => {
  const specData = nodeMaps[specId];
  if (!specData) return new Set();

  const result = new Set<string>();
  const allNodes = [...specData.classNodes, ...specData.specNodes, ...(specData.heroNodes ?? [])];

  for (const node of allNodes) {
    for (const entry of node.entries) {
      if ('spellId' in entry && entry.spellId) {
        result.add(entry.spellId.toString());
      }
    }
  }

  return result;
});
