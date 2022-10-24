/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from 'lodash';
import { Timestamp } from '@google-cloud/firestore';
// This file is a server-side file so this crazy import is OK for now
// TODO: fix this crazy import...
import { ICombatDataStub } from '../../packages/shared/src/graphql-server/types';
import { ICombatData, CombatUnitType, CombatUnitSpec } from '../../packages/wow-combat-log-parser/src';
import moment from 'moment';

/*
  This DTO adds some fields to make queries less index intensive and easier to write
*/
export interface FirebaseDTO extends ICombatDataStub {
  combatantNames: string[];
  combatantGuids: string[];
  extra: QueryHelpers;
  expires: Timestamp; // Used to set object TTL for auto-delete
}

interface QueryHelpers {
  matchAverageMMR: number;
  singleSidedSpecs: string[];
  doubleSidedSpecs: string[];
  singleSidedSpecsWinners: string[];
  doubleSidedSpecsWLHS: string[];
  gte1400: boolean;
  gte1600: boolean;
  gte1800: boolean;
  gte2100: boolean;
  gte2400: boolean;
  gte2700: boolean;
}

function all_combinations(set: any[]) {
  let combs: any[] = [];
  for (let i = 0; i < set.length; i++) {
    combs = combs.concat(k_combinations(set, i + 1));
  }
  return combs;
}

function k_combinations(set: any[], k: number): any[] {
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
    tailcombs = k_combinations(set.slice(i + 1), k - 1);
    for (j = 0; j < tailcombs.length; j++) {
      combs.push(head.concat(tailcombs[j]));
    }
  }
  return combs;
}

function buildQueryHelpers(com: ICombatData): QueryHelpers {
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
  const team0sss = all_combinations(team0specs).map((s: string[]) => s.join('_'));
  const team1sss = all_combinations(team1specs).map((s: string[]) => s.join('_'));
  let singleSidedSpecsWinners = [];
  if (com.endInfo?.winningTeamId === '0') {
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
      if (com.endInfo?.winningTeamId === '0') {
        doubleSidedWinnersLHS.add(`${t0}x${t1}`);
      } else {
        doubleSidedWinnersLHS.add(`${t1}x${t0}`);
      }
    }
  }
  return {
    matchAverageMMR: ((com.endInfo?.team0MMR || 0) + (com.endInfo?.team1MMR || 0)) / 2,
    gte1400: com.playerTeamRating >= 1400,
    gte1600: com.playerTeamRating >= 1600,
    gte1800: com.playerTeamRating >= 1800,
    gte2100: com.playerTeamRating >= 2100,
    gte2400: com.playerTeamRating >= 2400,
    gte2700: com.playerTeamRating >= 2700,
    singleSidedSpecs: team0sss.concat(team1sss),
    singleSidedSpecsWinners,
    doubleSidedSpecs: Array.from(doubleSided),
    doubleSidedSpecsWLHS: Array.from(doubleSidedWinnersLHS),
  };
}

function createStubDTOFromCombat(com: ICombatData, ownerId: string, logObjectUrl: string): FirebaseDTO {
  const inThirtyDays = moment().add('days', 30);
  const unitsList = _.values(com.units).map((c) => {
    if (c.info) c.info.equipment = []; // remove equipped items to save storage
    return {
      id: c.id,
      name: c.name,
      info: c.info,
      type: c.type,
      class: c.class,
      spec: c.spec,
      reaction: c.reaction,
    };
  });
  return {
    logObjectUrl,
    ownerId,
    wowVersion: com.wowVersion,
    id: com.id,
    units: unitsList,
    utcCorrected: false,
    startTime: com.startTime,
    endTime: com.endTime,
    playerTeamId: com.playerTeamId,
    playerTeamRating: com.playerTeamRating,
    hasAdvancedLogging: com.hasAdvancedLogging,
    endInfo: com.endInfo,
    startInfo: com.startInfo,
    result: com.result,
    extra: buildQueryHelpers(com),
    combatantNames: unitsList.filter((u) => u.type === CombatUnitType.Player).map((u) => u.name),
    combatantGuids: unitsList.filter((u) => u.type === CombatUnitType.Player).map((u) => u.id),
    expires: Timestamp.fromDate(inThirtyDays.toDate()),
  };
}

export { createStubDTOFromCombat };
