import _ from 'lodash';
import md5 from 'md5';

import { AtomicArenaCombat, IArenaMatch, IShuffleRound } from './CombatData';
import { ICombatUnit } from './CombatUnit';
import {
  CombatUnitAffiliation,
  CombatUnitClass,
  CombatUnitPowerType,
  CombatUnitReaction,
  CombatUnitSpec,
  CombatUnitType,
} from './types';

export const PIPELINE_FLUSH_SIGNAL = '__WOW_ARENA_LOGS_PIPELINE_FLUSH_SIGNAL__';

export function nullthrows<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw Error('this value cannot be null or undefined');
  }
  return value;
}

export const parseQuotedName = (quotedName: string): string => {
  return quotedName.replace(/"/g, '');
};

export function computeCanonicalHash(buffer: string[]): string {
  return md5(buffer.join('\n').slice(0, 16348));
}

export function getUnitType(flag: number): CombatUnitType {
  // tslint:disable-next-line: no-bitwise
  const masked = flag & 0x0000fc00;
  switch (masked) {
    case 0x00000400:
      return CombatUnitType.Player;
    case 0x00000800:
      return CombatUnitType.NPC;
    case 0x00001000:
      return CombatUnitType.Pet;
    case 0x00002000:
      return CombatUnitType.Guardian;
    case 0x00004000:
      return CombatUnitType.Object;
    default:
      return CombatUnitType.None;
  }
}
export function getUnitReaction(flag: number): CombatUnitReaction {
  // tslint:disable-next-line: no-bitwise
  const masked = flag & 0x000000f0;
  switch (masked) {
    case 0x00000040:
      return CombatUnitReaction.Hostile;
    case 0x00000010:
      return CombatUnitReaction.Friendly;
    default:
      return CombatUnitReaction.Neutral;
  }
}

export function getUnitAffiliation(flag: number): CombatUnitAffiliation {
  // tslint:disable-next-line: no-bitwise
  const masked = flag & 0x0000000f;
  switch (masked) {
    case 0x00000001:
      return CombatUnitAffiliation.Mine;
    case 0x00000002:
      return CombatUnitAffiliation.Party;
    case 0x00000004:
      return CombatUnitAffiliation.Raid;
    case 0x00000008:
      return CombatUnitAffiliation.Outsider;
    default:
      return CombatUnitAffiliation.None;
  }
}

export const getClassColor = (unitClass: CombatUnitClass): string => {
  switch (unitClass) {
    default:
      return '#607D8B';
    case CombatUnitClass.DeathKnight:
      return '#C41F3B';
    case CombatUnitClass.DemonHunter:
      return '#A330C9';
    case CombatUnitClass.Druid:
      return '#FF7D0A';
    case CombatUnitClass.Hunter:
      return '#A9D271';
    case CombatUnitClass.Mage:
      return '#40C7EB';
    case CombatUnitClass.Monk:
      return '#00FF96';
    case CombatUnitClass.Paladin:
      return '#F58CBA';
    case CombatUnitClass.Priest:
      return '#FFFFFF';
    case CombatUnitClass.Rogue:
      return '#FFF569';
    case CombatUnitClass.Shaman:
      return '#0070DE';
    case CombatUnitClass.Warlock:
      return '#8787ED';
    case CombatUnitClass.Warrior:
      return '#C79C6E';
    case CombatUnitClass.Evoker:
      return '#33937F';
  }
};

export const getPowerColor = (powerType: CombatUnitPowerType) => {
  switch (powerType) {
    case CombatUnitPowerType.Mana:
      return '#0000FF';
    case CombatUnitPowerType.Rage:
      return '#FF0000';
    case CombatUnitPowerType.Focus:
      return '#FF8040';
    case CombatUnitPowerType.Energy:
      return '#FFFF00';
    case CombatUnitPowerType.ComboPoints:
      return '#FFF569';
    case CombatUnitPowerType.Runes:
      return '#808080';
    case CombatUnitPowerType.RunicPower:
      return '#00D1FF';
    case CombatUnitPowerType.SoulShards:
      return '#80528C';
    case CombatUnitPowerType.LunarPower:
      return '#4D85E6';
    case CombatUnitPowerType.HolyPower:
      return '#F2E699';
    case CombatUnitPowerType.Maelstrom:
      return '#0080FF';
    case CombatUnitPowerType.Insanity:
      return '#6600CC';
    case CombatUnitPowerType.Chi:
      return '#B5FFEB';
    case CombatUnitPowerType.ArcaneCharges:
      return '#1A1AFA';
    case CombatUnitPowerType.Fury:
      return '#C942FD';
    case CombatUnitPowerType.Pain:
      return '#FF9C00';
    default:
      return 'transparent';
  }
};

export interface SpecIndexFields {
  singleSidedSpecs: string[];
  doubleSidedSpecs: string[];
  singleSidedSpecsWinners: string[];
  doubleSidedSpecsWLHS: string[];
}

export interface MMRIndexFields {
  matchAverageMMR: number;
  gte1400: boolean;
  gte1800: boolean;
  gte2100: boolean;
  gte2400: boolean;
}

function kCombinations<T>(set: T[], k: number): T[][] {
  // https://gist.github.com/axelpale/3118596
  let i, j, combs, head, tailcombs;
  if (k > set.length || k <= 0) {
    return [];
  }
  if (k === set.length) {
    return [set];
  }
  if (k === 1) {
    combs = [];
    for (i = 0; i < set.length; i++) {
      combs.push([set[i]]);
    }
    return combs;
  }
  combs = [];
  for (i = 0; i < set.length - k + 1; i++) {
    head = set.slice(i, i + 1);
    tailcombs = kCombinations(set.slice(i + 1), k - 1);
    for (j = 0; j < tailcombs.length; j++) {
      combs.push(head.concat(tailcombs[j]));
    }
  }
  return combs;
}

function allCombinations<T>(set: T[]): T[][] {
  let combs: T[][] = [];
  for (let i = 0; i < set.length; i++) {
    combs = combs.concat(kCombinations(set, i + 1));
  }
  return combs;
}

export function buildMMRHelpers(com: IArenaMatch | IShuffleRound): MMRIndexFields {
  const averageMMR =
    com.dataType === 'ArenaMatch'
      ? ((com.endInfo?.team0MMR || 0) + (com.endInfo?.team1MMR || 0)) / 2
      : ((com.shuffleMatchEndInfo?.team0MMR || 0) + (com.shuffleMatchEndInfo?.team1MMR || 0)) / 2;
  return {
    matchAverageMMR: averageMMR,
    gte1400: nullthrows(averageMMR) >= 1400,
    gte1800: nullthrows(averageMMR) >= 1800,
    gte2100: nullthrows(averageMMR) >= 2100,
    gte2400: nullthrows(averageMMR) >= 2400,
  };
}

export function buildQueryHelpers(
  com: IArenaMatch | IShuffleRound,
  excludePartialCombinations = false,
): SpecIndexFields {
  const unitsList = _.values(com.units).map((c) => ({
    id: c.id,
    name: c.name,
    info: c.info,
    type: c.type,
    class: c.class,
    spec: c.spec,
    reaction: c.reaction,
  }));
  const team0specs = unitsList
    .filter((u) => u.type === CombatUnitType.Player)
    .filter((u) => u.info?.teamId === '0')
    .map((u) => (u.spec === CombatUnitSpec.None ? `c${u.class}` : u.spec))
    .sort();
  const team1specs = unitsList
    .filter((u) => u.type === CombatUnitType.Player)
    .filter((u) => u.info?.teamId === '1')
    .map((u) => (u.spec === CombatUnitSpec.None ? `c${u.class}` : u.spec))
    .sort();
  const team0sss = allCombinations(team0specs)
    .map((s: string[]) => {
      // this logic is designed for google analytics which has a limit of 100 total characters per property.
      // so we had to reduce the number of combinations we send in the analytics event.
      if (excludePartialCombinations && s.length !== 1 && s.length !== team0specs.length) {
        return '';
      }
      return s.join('_');
    })
    .filter((s) => s !== '');
  const team1sss = allCombinations(team1specs)
    .map((s: string[]) => {
      // this logic is designed for google analytics which has a limit of 100 total characters per property.
      // so we had to reduce the number of combinations we send in the analytics event.
      if (excludePartialCombinations && s.length !== 1 && s.length !== team1specs.length) {
        return '';
      }
      return s.join('_');
    })
    .filter((s) => s !== '');
  let singleSidedSpecsWinners = [];
  if (com.winningTeamId === '0') {
    singleSidedSpecsWinners = team0sss;
  } else {
    singleSidedSpecsWinners = team1sss;
  }
  const doubleSided = new Set<string>();
  const doubleSidedWinnersLHS = new Set<string>();
  for (const t0 of team0sss) {
    for (const t1 of team1sss) {
      doubleSided.add(`${t0}x${t1}`);
      doubleSided.add(`${t1}x${t0}`);
      if (com.winningTeamId === '0') {
        doubleSidedWinnersLHS.add(`${t0}x${t1}`);
      } else {
        doubleSidedWinnersLHS.add(`${t1}x${t0}`);
      }
    }
  }
  return {
    singleSidedSpecs: team0sss.concat(team1sss),
    singleSidedSpecsWinners,
    doubleSidedSpecs: Array.from(doubleSided),
    doubleSidedSpecsWLHS: Array.from(doubleSidedWinnersLHS),
  };
}

export function getEffectiveCombatDuration(combat: AtomicArenaCombat) {
  const damageEvents = combat.events.filter((e) => e.logLine.event.endsWith('_DAMAGE'));
  const effectiveStartTime = damageEvents.length > 0 ? damageEvents[0].logLine.timestamp : combat.startTime;
  const effectiveEndTime =
    damageEvents.length > 0 ? damageEvents[damageEvents.length - 1].logLine.timestamp : combat.endTime;
  return (effectiveEndTime - effectiveStartTime) / 1000;
}

export function getEffectiveDps(units: ICombatUnit[], effectiveDuration: number) {
  return _.sum(units.map((p) => _.sum(p.damageOut.map((d) => Math.abs(d.effectiveAmount))))) / effectiveDuration;
}

export function getBurstDps(units: ICombatUnit[], burstWindow = 3000) {
  const allDamageOut = _.sortBy(
    units.flatMap((p) => p.damageOut),
    (d) => d.timestamp,
  );

  let l = 0;
  let r = 0;
  let burstDps = 0;
  while (r < allDamageOut.length) {
    while (r < allDamageOut.length && allDamageOut[r].timestamp - allDamageOut[l].timestamp <= burstWindow) {
      r++;
    }
    const eventsInWindow = allDamageOut.slice(l, r);
    const totalDamageInWindow = _.sum(eventsInWindow.map((d) => Math.abs(d.effectiveAmount)));
    burstDps = Math.max(burstDps, totalDamageInWindow / (burstWindow / 1000));
    l++;
  }
  return burstDps;
}

export function getEffectiveHps(units: ICombatUnit[], effectiveDuration: number) {
  return (
    _.sum(
      units.map(
        (p) => _.sum(p.healOut.map((d) => d.effectiveAmount)) + _.sum(p.absorbsOut.map((d) => d.effectiveAmount)),
      ),
    ) / effectiveDuration
  );
}
