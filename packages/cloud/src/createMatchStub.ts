import { Timestamp } from '@google-cloud/firestore';
import _ from 'lodash';
import moment from 'moment';

// Do not reference with @shared here -- this ref style is needed to preserve tsconfig settings
// for the application build in @shared
import { ICombatDataStub } from '../../shared/src/graphql-server/types/index';

import { IArenaMatch, IShuffleRound, CombatUnitType, CombatUnitSpec, IShuffleMatch } from '../../parser/dist/index';

export function nullthrows<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw Error('this value cannot be null or undefined');
  }
  return value;
}

/*
  This DTO adds some fields to make queries less index intensive and easier to write
*/
export type FirebaseDTO = ICombatDataStub & {
  combatantNames: string[];
  combatantGuids: string[];
  extra: QueryHelpers;
  expires: Timestamp; // Used to set object TTL for auto-delete
};

interface SpecIndexFields {
  singleSidedSpecs: string[];
  doubleSidedSpecs: string[];
  singleSidedSpecsWinners: string[];
  doubleSidedSpecsWLHS: string[];
}

interface MMRIndexFields {
  matchAverageMMR: number;
  gte1400: boolean;
  gte1800: boolean;
  gte2100: boolean;
  gte2400: boolean;
}
interface QueryHelpers extends SpecIndexFields, MMRIndexFields {}

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

function buildMMRHelpers(com: IArenaMatch | IShuffleRound): MMRIndexFields {
  const averageMMR =
    com.dataType === 'ArenaMatch'
      ? ((com.endInfo?.team0MMR || 0) + (com.endInfo?.team1MMR || 0)) / 2
      : ((com.shuffleMatchEndInfo?.team0MMR || 0) + (com.shuffleMatchEndInfo?.team1MMR || 0)) / 2;
  return {
    matchAverageMMR: averageMMR,
    gte1400: nullthrows(com.playerTeamRating) >= 1400,
    gte1800: nullthrows(com.playerTeamRating) >= 1800,
    gte2100: nullthrows(com.playerTeamRating) >= 2100,
    gte2400: nullthrows(com.playerTeamRating) >= 2400,
  };
}

function buildQueryHelpers(com: IArenaMatch | IShuffleRound): SpecIndexFields {
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

function createStubDTOFromShuffleMatch(match: IShuffleMatch, ownerId: string, logObjectUrl: string): FirebaseDTO[] {
  const rounds = match.rounds;
  const lastRound = rounds[5];

  const inThirtyDays = moment().add(30, 'days');
  const unitsList = _.values(lastRound.units).map((c) => {
    return {
      id: c.id,
      name: c.name,
      info: c.info
        ? {
            teamId: c.info.teamId,
            specId: c.info.specId,
            talents: c.info.talents,
            pvpTalents: c.info.pvpTalents,
            personalRating: c.info.personalRating,
            highestPvpTier: c.info.highestPvpTier,
          }
        : undefined,
      type: c.type,
      class: c.class,
      spec: c.spec,
      reaction: c.reaction,
      affiliation: c.affiliation,
    };
  });

  rounds.forEach((round) => {
    round.shuffleMatchEndInfo = match.endInfo;
    round.shuffleMatchResult = match.result;
  });

  return rounds.map((round) => ({
    dataType: 'ShuffleRound',
    logObjectUrl,
    ownerId,
    wowVersion: round.wowVersion,
    id: round.id,
    units: unitsList,
    utcCorrected: false,
    startTime: round.startTime,
    endTime: round.endTime,
    playerTeamId: lastRound.playerTeamId,
    playerTeamRating: lastRound.playerTeamRating,
    hasAdvancedLogging: lastRound.hasAdvancedLogging,
    startInfo: round.startInfo,
    linesNotParsedCount: round.linesNotParsedCount,
    durationInSeconds: round.durationInSeconds,
    playerId: round.playerId,
    winningTeamId: round.winningTeamId,
    killedUnitId: round.killedUnitId,
    scoreboard: round.scoreboard,
    sequenceNumber: round.sequenceNumber,
    // endInfo: UNDEFINED HERE!
    result: round.result,
    extra: { ...buildQueryHelpers(round), ...buildMMRHelpers(round) },
    combatantNames: unitsList.filter((u) => u.type === CombatUnitType.Player).map((u) => u.name),
    combatantGuids: unitsList.filter((u) => u.type === CombatUnitType.Player).map((u) => u.id),
    expires: Timestamp.fromDate(inThirtyDays.toDate()),
    shuffleMatchId: match.id,
    shuffleMatchResult: match.result,
    shuffleMatchEndInfo: match.endInfo,
  }));
}

function createStubDTOFromArenaMatch(com: IArenaMatch, ownerId: string, logObjectUrl: string): FirebaseDTO {
  const inThirtyDays = moment().add(30, 'days');
  const unitsList = _.values(com.units).map((c) => {
    if (!c.info) throw new Error(`Could not find player info for ${c.id}`);
    return {
      id: c.id,
      name: c.name,
      info: {
        teamId: c.info.teamId,
        specId: c.info.specId,
        talents: c.info.talents,
        pvpTalents: c.info.pvpTalents,
        personalRating: c.info.personalRating,
        highestPvpTier: c.info.highestPvpTier,
      },
      type: c.type,
      class: c.class,
      spec: c.spec,
      reaction: c.reaction,
      affiliation: c.affiliation,
    };
  });
  return {
    dataType: 'ArenaMatch',
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
    linesNotParsedCount: com.linesNotParsedCount,
    playerId: com.playerId,
    durationInSeconds: com.durationInSeconds,
    winningTeamId: com.winningTeamId,
    extra: { ...buildQueryHelpers(com), ...buildMMRHelpers(com) },
    combatantNames: unitsList.filter((u) => u.type === CombatUnitType.Player).map((u) => u.name),
    combatantGuids: unitsList.filter((u) => u.type === CombatUnitType.Player).map((u) => u.id),
    expires: Timestamp.fromDate(inThirtyDays.toDate()),
  };
}

export { createStubDTOFromArenaMatch, createStubDTOFromShuffleMatch };
