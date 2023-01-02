import { Timestamp } from '@google-cloud/firestore';
import _ from 'lodash';
import moment from 'moment';

import {
  AggregationFields,
  buildAggregationHelpers,
  buildMMRHelpers,
  buildQueryHelpers,
  CombatUnitType,
  IArenaCombat,
  IArenaMatch,
  IShuffleMatch,
  MMRIndexFields,
  SpecIndexFields,
} from '../../parser/dist/index';
// Do not reference with @shared here -- this ref style is needed to preserve tsconfig settings
// for the application build in @shared
import { ICombatDataStub } from '../../shared/src/graphql-server/types/index';

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
  shuffleMatchId?: string;
  combatantNames: string[];
  combatantGuids: string[];
  extra: QueryHelpers;
  expires: Timestamp; // Used to set object TTL for auto-delete
  timezone: string;
};

interface QueryHelpers extends SpecIndexFields, MMRIndexFields, AggregationFields {}

function createUnitsList(units: IArenaCombat['units']) {
  return _.values(units).map((c) => {
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
}

function createStubDTOFromShuffleMatch(match: IShuffleMatch, ownerId: string, logObjectUrl: string): FirebaseDTO[] {
  const rounds = match.rounds;
  const lastRound = rounds[5];

  const inThirtyDays = moment().add(30, 'days');

  rounds.forEach((round) => {
    round.shuffleMatchEndInfo = match.endInfo;
    round.shuffleMatchResult = match.result;
  });

  return rounds.map((round) => {
    const roundUnits = createUnitsList(round.units);

    return {
      dataType: 'ShuffleRound',
      logObjectUrl,
      ownerId,
      wowVersion: round.wowVersion,
      id: round.id,
      units: roundUnits,
      startTime: round.startTime,
      endTime: round.endTime,
      playerTeamId: round.playerTeamId,
      playerTeamRating: lastRound.playerTeamRating,
      hasAdvancedLogging: round.hasAdvancedLogging,
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
      extra: { ...buildQueryHelpers(round), ...buildMMRHelpers(round), ...buildAggregationHelpers(round) },
      combatantNames: roundUnits.filter((u) => u.type === CombatUnitType.Player).map((u) => u.name),
      combatantGuids: roundUnits.filter((u) => u.type === CombatUnitType.Player).map((u) => u.id),
      expires: Timestamp.fromDate(inThirtyDays.toDate()),
      shuffleMatchId: match.id,
      shuffleMatchResult: match.result,
      shuffleMatchEndInfo: match.endInfo,
      timezone: round.timezone,
    };
  });
}

function createStubDTOFromArenaMatch(com: IArenaMatch, ownerId: string, logObjectUrl: string): FirebaseDTO {
  const inThirtyDays = moment().add(30, 'days');
  const combatUnits = createUnitsList(com.units);
  return {
    dataType: 'ArenaMatch',
    logObjectUrl,
    ownerId,
    wowVersion: com.wowVersion,
    id: com.id,
    units: combatUnits,
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
    extra: { ...buildQueryHelpers(com), ...buildMMRHelpers(com), ...buildAggregationHelpers(com) },
    combatantNames: combatUnits.filter((u) => u.type === CombatUnitType.Player).map((u) => u.name),
    combatantGuids: combatUnits.filter((u) => u.type === CombatUnitType.Player).map((u) => u.id),
    expires: Timestamp.fromDate(inThirtyDays.toDate()),
    timezone: com.timezone,
  };
}

export { createStubDTOFromArenaMatch, createStubDTOFromShuffleMatch };
