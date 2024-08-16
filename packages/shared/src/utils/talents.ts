import _ from 'lodash';

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
