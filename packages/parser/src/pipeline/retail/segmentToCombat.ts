import _ from 'lodash';
import { pipe } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import { ArenaMatchEnd } from '../../actions/ArenaMatchEnd';
import { ArenaMatchStart, ArenaMatchStartInfo } from '../../actions/ArenaMatchStart';
import {
  CombatData,
  IActivityStarted,
  IArenaMatch,
  IMalformedCombatData,
  IShuffleMatch,
  IShuffleRound,
} from '../../CombatData';
import { logInfo } from '../../logger';
import { CombatResult, CombatUnitType, ICombatEventSegment } from '../../types';
import { computeCanonicalHash, nullthrows } from '../../utils';
import { isNonNull } from '../common/utils';

// Global buffer to hold recent shuffle rounds
// once a shuffle-ending is detected this is reset
let recentShuffleRoundsBuffer: IShuffleRound[] = [];
let recentScoreboardBuffer: IShuffleRound['scoreboard'] = [];

function recordOutcomeToScoreboard(unitId: string, didWin: boolean) {
  const score = recentScoreboardBuffer.find((u) => u.unitId === unitId);
  if (!score) {
    recentScoreboardBuffer.push({
      unitId,
      wins: didWin ? 1 : 0,
    });
  } else {
    score.wins = didWin ? score.wins + 1 : score.wins;
  }
}

function roundsBelongToSameMatch(roundA: ArenaMatchStartInfo, roundB: ArenaMatchStartInfo) {
  // ARENA_MATCH_START is identical for every round of a shuffle except the timestamp
  if (roundA.bracket !== roundB.bracket) return false;
  if (roundA.isRanked !== roundB.isRanked) return false;
  if (roundA.item1 !== roundB.item1) return false;
  if (roundA.zoneId !== roundB.zoneId) return false;
  return true;
}

// TODO: Handle case where a round is accidentally ingested twice; timestamp will match
// something already in buffer

// Some sanity checks before we report this shuffle
function validateRounds(rounds: IShuffleRound[]) {
  // Must contain 6 rounds
  if (rounds.length !== 6) {
    logInfo(`validateRounds length != 6`);
    return false;
  }

  for (let i = 1; i < 6; i++) {
    if (!roundsBelongToSameMatch(rounds[i].startInfo, rounds[0].startInfo)) {
      logInfo(`validateRounds ${i} => false`);
      return false;
    }
  }
  return true;
}

function decodeShuffleRound(
  segment: ICombatEventSegment,
  recentShuffleRounds: IShuffleRound[],
  recentScoreboard: IShuffleRound['scoreboard'],
  timezone: string,
) {
  // a segment was emitted that looks valid but does not end with ArenaMatchEnd
  // assume this is a solo shuffle round
  const combat = new CombatData('retail', timezone);
  combat.startTime = segment.events[0].timestamp || 0;
  segment.events.forEach((e) => {
    combat.readEvent(e);
  });
  combat.end();
  logInfo(`ending combat`);

  if (recentShuffleRounds.length == 6) {
    // Panic: Already 6 rounds in the buffer, this cant be the same solo shuffle match
    logInfo(`decodeShuffle panic 1 - rounds length=${recentShuffleRounds.length}`);
    recentShuffleRoundsBuffer = [];
    recentScoreboardBuffer = [];
  }

  if (
    recentShuffleRounds.length > 0 &&
    !roundsBelongToSameMatch(recentShuffleRounds[0].startInfo, nullthrows(combat.startInfo))
  ) {
    logInfo(`decodeShuffle panic 2 - rounds length=${recentShuffleRounds.length}`);
    // Panic: New round does not appear to be a member of the solo shuffle match
    recentShuffleRoundsBuffer = [];
    recentScoreboardBuffer = [];
  }

  const players = _.values(combat.units).filter((a) => a.type === CombatUnitType.Player);

  const playerDeaths = players
    .map((unit) => ({
      unit,
      deathRecords: unit.deathRecords,
    }))
    .filter((a) => a.deathRecords.length > 0);

  if (playerDeaths.length == 0) {
    logInfo('decodeShuffle panic 3 - No player deaths');
    throw new Error(`No player deaths`);
  }
  const deadPlayerId = playerDeaths[0].unit.id;
  const deathRecords = playerDeaths[0].deathRecords;

  if (deathRecords.length !== 1) {
    logInfo('decodeShuffle panic 4 - wrong death records');
    throw new Error(`Wrong number of death records for player, invalid round n=${deathRecords.length}`);
  }

  const losingTeam = combat.units[deadPlayerId].info?.teamId;

  if (typeof losingTeam !== 'string') {
    logInfo('decodeShuffle panic 5 - no winner');
    throw new Error('Could not determine winners of shuffle round');
  }

  players.forEach((unit) => {
    recordOutcomeToScoreboard(unit.id, unit.info?.teamId !== losingTeam);
  });

  const deadPlayerTeam = playerDeaths[0].unit.info?.teamId;
  const result = combat.playerTeamId === deadPlayerTeam ? CombatResult.Lose : CombatResult.Win;

  logInfo(`Decoded result ${result}`);
  const endTime = combat.endInfo ? combat.endInfo.timestamp : deathRecords[0].timestamp;

  const rv: IShuffleRound = {
    id: computeCanonicalHash(segment.lines),
    wowVersion: 'retail',
    dataType: 'ShuffleRound',
    startInfo: nullthrows(combat.startInfo),
    units: combat.units,
    events: combat.events,
    rawLines: segment.lines,
    linesNotParsedCount: combat.linesNotParsedCount,
    winningTeamId: losingTeam === '0' ? '1' : '0',
    killedUnitId: deadPlayerId,
    scoreboard: _.cloneDeep(recentScoreboard),
    sequenceNumber: recentShuffleRounds.length,
    startTime: combat.startTime,
    endTime,
    hasAdvancedLogging: combat.hasAdvancedLogging,
    playerId: combat.playerId,
    playerTeamId: combat.playerTeamId,
    playerTeamRating: combat.playerTeamRating,
    result: result,
    durationInSeconds: (endTime - combat.startTime) / 1000,
    timezone: combat.timezone,
  };

  recentShuffleRounds.push(rv);
  return {
    shuffle: rv,
    combat,
  };
}

export const segmentToCombat = () => {
  return pipe(
    map(
      (
        segment: ICombatEventSegment | IActivityStarted,
      ): IArenaMatch | IMalformedCombatData | IShuffleRound | IShuffleMatch | IActivityStarted | null => {
        logInfo(`segmentToCombat ${segment.dataType}`);
        // Pass-through events that aren't relevant to the combat generation process
        if (segment.dataType == 'ActivityStarted') {
          return segment;
        }
        if (segment.events[0] instanceof ArenaMatchStart) {
          segment.lines[0];
        }

        const isShuffleRound =
          segment.events.length >= 3 &&
          segment.events[0] instanceof ArenaMatchStart &&
          !(segment.events[segment.events.length - 1] instanceof ArenaMatchEnd);

        const metadataLooksGood =
          segment.events.length >= 3 &&
          segment.events[0] instanceof ArenaMatchStart &&
          segment.events[segment.events.length - 1] instanceof ArenaMatchEnd;

        logInfo(`segmentToCombat isShuffleRound=${isShuffleRound} metadataLooksGood=${metadataLooksGood}`);
        if (isShuffleRound) {
          try {
            logInfo(`decoding as individual shuffle round...`);
            const decoded = decodeShuffleRound(
              segment,
              recentShuffleRoundsBuffer,
              recentScoreboardBuffer,
              segment.events[0].logLine.timezone,
            );
            return decoded.shuffle;
          } catch (e) {
            logInfo('Decoder fail');
            logInfo(e);
          }
        }

        if (metadataLooksGood) {
          if (segment.events[0] instanceof ArenaMatchStart && segment.events[0].bracket.endsWith('Solo Shuffle')) {
            try {
              logInfo(`final shuffle round decode starting`);
              const decoded = decodeShuffleRound(
                segment,
                recentShuffleRoundsBuffer,
                recentScoreboardBuffer,
                segment.events[0].logLine.timezone,
              );
              const validRounds = validateRounds(recentShuffleRoundsBuffer);

              logInfo(`final shuffle round validRounds=${validRounds}`);
              if (validRounds) {
                const shuf: IShuffleMatch = {
                  wowVersion: 'retail',
                  dataType: 'ShuffleMatch',
                  id: decoded.shuffle.id, // Using id of last round
                  startTime: recentShuffleRoundsBuffer[0].startTime,
                  endTime: decoded.combat.endTime,
                  result: decoded.combat.result,
                  startInfo: nullthrows(decoded.combat.startInfo),
                  endInfo: nullthrows(decoded.combat.endInfo),
                  rounds: [...recentShuffleRoundsBuffer],
                  durationInSeconds: (decoded.combat.endTime - recentShuffleRoundsBuffer[0].startTime) / 1000,
                  timezone: decoded.combat.timezone,
                  reportFinalRound: true,
                };
                recentShuffleRoundsBuffer = [];
                recentScoreboardBuffer = [];
                return shuf;
              } else {
                // We hit a final round (ARENA_MATCH_END) but the Match itself wasn't a valid 6-round shuffle
                // We want to emit the shuffle as a round but then reset the internal match aggregator

                const lastViableRound = recentShuffleRoundsBuffer[recentShuffleRoundsBuffer.length - 1];
                const shuf: IShuffleMatch = {
                  wowVersion: 'retail',
                  dataType: 'ShuffleMatch',
                  id: lastViableRound.id, // Using id of last round
                  startTime: recentShuffleRoundsBuffer[0].startTime,
                  endTime: lastViableRound.endTime,
                  result: lastViableRound.result,
                  startInfo: nullthrows(lastViableRound.startInfo),
                  endInfo: new ArenaMatchEnd(segment.events[segment.events.length - 1].logLine),
                  rounds: [...recentShuffleRoundsBuffer],
                  durationInSeconds: (lastViableRound.endTime - recentShuffleRoundsBuffer[0].startTime) / 1000,
                  timezone: lastViableRound.timezone,
                  reportFinalRound: true,
                };
                recentShuffleRoundsBuffer = [];
                recentScoreboardBuffer = [];
                return shuf;
                // recentShuffleRoundsBuffer = [];
                // recentScoreboardBuffer = [];
                // return decoded.shuffle;
              }
            } catch (e) {
              logInfo(`Decoding final round error ${e}`);
              // Something ended the shuffle early and the final round was not a valid combat
              // Eject the buffer as a partial shuffle match
              const lastViableRound = recentShuffleRoundsBuffer[recentShuffleRoundsBuffer.length - 1];
              const shuf: IShuffleMatch = {
                wowVersion: 'retail',
                dataType: 'ShuffleMatch',
                id: lastViableRound.id, // Using id of last round
                startTime: recentShuffleRoundsBuffer[0].startTime,
                endTime: lastViableRound.endTime,
                result: lastViableRound.result,
                startInfo: nullthrows(lastViableRound.startInfo),
                endInfo: new ArenaMatchEnd(segment.events[segment.events.length - 1].logLine),
                rounds: [...recentShuffleRoundsBuffer],
                durationInSeconds: (lastViableRound.endTime - recentShuffleRoundsBuffer[0].startTime) / 1000,
                timezone: lastViableRound.timezone,
                reportFinalRound: false,
              };
              recentShuffleRoundsBuffer = [];
              recentScoreboardBuffer = [];
              return shuf;
            }
          } else {
            const combat = new CombatData('retail', segment.events[0].logLine.timezone);
            combat.startTime = segment.events[0].timestamp || 0;
            segment.events.forEach((e) => {
              combat.readEvent(e);
            });
            combat.end();

            if (combat.isWellFormed) {
              const plainCombatDataObject: IArenaMatch = {
                dataType: 'ArenaMatch',
                timezone: combat.timezone,
                events: combat.events,
                id: computeCanonicalHash(segment.lines),
                wowVersion: combat.wowVersion,
                startTime: combat.startTime,
                endTime: combat.endTime,
                units: combat.units,
                playerId: combat.playerId,
                playerTeamId: combat.playerTeamId,
                playerTeamRating: combat.playerTeamRating,
                result: combat.result,
                hasAdvancedLogging: combat.hasAdvancedLogging,
                rawLines: segment.lines,
                linesNotParsedCount: segment.lines.length - segment.events.length,
                startInfo: nullthrows(combat.startInfo),
                endInfo: nullthrows(combat.endInfo),
                winningTeamId: nullthrows(combat.endInfo?.winningTeamId),
                durationInSeconds: nullthrows(combat.endInfo?.matchDurationInSeconds),
              };
              return plainCombatDataObject;
            }
          }
        }

        if (segment.events.length >= 1 && segment.events[0] instanceof ArenaMatchStart) {
          const malformedCombatObject: IMalformedCombatData = {
            wowVersion: 'retail', // TODO: malformed classic matches?
            dataType: 'MalformedCombat',
            id: computeCanonicalHash(segment.lines),
            isWellFormed: false,
            startTime: segment.events[0].timestamp,
            rawLines: segment.lines,
            linesNotParsedCount: segment.lines.length - segment.events.length,
          };
          return malformedCombatObject;
        }

        logInfo(`combatToSegment=>null`);
        return null;
      },
    ),
    filter(isNonNull),
  );
};
