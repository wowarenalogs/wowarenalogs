import { pipe } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import _ from 'lodash';

import { CombatData, ICombatData, IMalformedCombatData, IShuffleCombatData, IShuffleRoundData } from '../../CombatData';
import { ArenaMatchEnd } from '../../actions/ArenaMatchEnd';
import { ArenaMatchStart } from '../../actions/ArenaMatchStart';
import { CombatUnitType, ICombatEventSegment } from '../../types';
import { computeCanonicalHash, nullthrows } from '../../utils';
import { isNonNull } from '../common/utils';

// Global buffer to hold recent shuffle rounds
// once a shuffle-ending is detected this is reset
let recentShuffleRoundsBuffer: IShuffleRoundData[] = [];
let recentScoreboardBuffer: IShuffleRoundData['scoreboard'] = {};

// Some sanity checks before we report this shuffle
function validateRounds(rounds: IShuffleRoundData[]) {
  // Must contain 6 rounds
  if (rounds.length !== 6) return false;

  // ARENA_MATCH_START is identical for every round of a shuffle except the timestamp
  for (let i = 1; i < 6; i++) {
    if (rounds[i].startInfo.bracket !== rounds[0].startInfo.bracket) return false;
    if (rounds[i].startInfo.isRanked !== rounds[0].startInfo.isRanked) return false;
    if (rounds[i].startInfo.item1 !== rounds[0].startInfo.item1) return false;
    if (rounds[i].startInfo.zoneId !== rounds[0].startInfo.zoneId) return false;
  }
  return true;
}

function decodeShuffleRound(
  segment: ICombatEventSegment,
  recentShuffleRounds: IShuffleRoundData[],
  recentScoreboard: IShuffleRoundData['scoreboard'],
) {
  // a segment was emitted that looks valid but does not end with ArenaMatchEnd
  // assume this is a solo shuffle round
  const combat = new CombatData('retail');
  combat.startTime = segment.events[0].timestamp || 0;
  segment.events.forEach((e) => {
    combat.readEvent(e);
  });
  combat.end();

  const players = _.values(combat.units).filter((a) => a.type === CombatUnitType.Player);

  const playerDeaths = players
    .map((unit) => ({
      unit,
      deathRecords: unit.deathRecords,
    }))
    .filter((a) => a.deathRecords.length > 0);

  if (playerDeaths.length !== 1) {
    throw new Error(`Wrong number of players dead, invalid round n=${playerDeaths.length}`);
  }
  const deadPlayerId = playerDeaths[0].unit.id;
  const deathRecords = playerDeaths[0].deathRecords;

  if (deathRecords.length !== 1) {
    throw new Error(`Wrong number of death records for player, invalid round n=${deathRecords.length}`);
  }

  const losingTeam = combat.units[deadPlayerId].info?.teamId;

  if (typeof losingTeam !== 'string') {
    throw new Error('Could not determine winners of shuffle round');
  }

  players.forEach((unit) => {
    if (!recentScoreboard[unit.id]) recentScoreboard[unit.id] = 0;
    if (unit.info?.teamId !== losingTeam) {
      recentScoreboard[unit.id] = recentScoreboard[unit.id] + 1;
    }
  });

  const rv: IShuffleRoundData = {
    dataType: 'ShuffleRound',
    startInfo: nullthrows(combat.startInfo),
    units: combat.units,
    events: combat.events,
    rawLines: segment.lines,
    linesNotParsedCount: combat.linesNotParsedCount,
    winningTeamId: losingTeam === '0' ? '1' : '0',
    roundEndInfo: {
      endTime: deathRecords[0].timestamp,
      killedUnitId: deadPlayerId,
    },
    scoreboard: _.clone(recentScoreboard),
    sequenceNumber: recentShuffleRounds.length,
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
        segment: ICombatEventSegment,
      ): ICombatData | IMalformedCombatData | IShuffleRoundData | IShuffleCombatData | null => {
        const isShuffleRound =
          segment.events.length >= 3 &&
          segment.events[0] instanceof ArenaMatchStart &&
          !(segment.events[segment.events.length - 1] instanceof ArenaMatchEnd);

        const metadataLooksGood =
          segment.events.length >= 3 &&
          segment.events[0] instanceof ArenaMatchStart &&
          segment.events[segment.events.length - 1] instanceof ArenaMatchEnd;

        if (isShuffleRound) {
          try {
            const decoded = decodeShuffleRound(segment, recentShuffleRoundsBuffer, recentScoreboardBuffer);
            return decoded.shuffle;
          } catch (e) {
            console.log('Decoder fail', e);
          }
        }

        if (metadataLooksGood) {
          if (segment.events[0] instanceof ArenaMatchStart && segment.events[0].bracket.endsWith('Solo Shuffle')) {
            const decoded = decodeShuffleRound(segment, recentShuffleRoundsBuffer, recentScoreboardBuffer);

            if (validateRounds(recentShuffleRoundsBuffer)) {
              const shuf: IShuffleCombatData = {
                dataType: 'Shuffle',
                id: 'what for this', // TODO: which id to use??
                wowVersion: 'retail',
                isWellFormed: true, // TODO: decide how to handle this field
                startTime: recentShuffleRoundsBuffer[0].startInfo.timestamp, // TODO: start of first round??
                endTime: decoded.combat.endTime,
                hasAdvancedLogging: decoded.combat.hasAdvancedLogging,
                result: decoded.combat.result, // TODO: wrong data here
                startInfo: nullthrows(decoded.combat.startInfo),
                endInfo: nullthrows(decoded.combat.endInfo),
                rounds: [...recentShuffleRoundsBuffer], // TODO: round buffer
              };
              recentShuffleRoundsBuffer = [];
              recentScoreboardBuffer = {};
              return shuf;
            }
          } else {
            const combat = new CombatData('retail');
            combat.startTime = segment.events[0].timestamp || 0;
            segment.events.forEach((e) => {
              combat.readEvent(e);
            });
            combat.end();

            if (combat.isWellFormed) {
              const plainCombatDataObject: ICombatData = {
                dataType: 'Combat',
                events: combat.events,
                id: computeCanonicalHash(segment.lines),
                wowVersion: combat.wowVersion,
                isWellFormed: true,
                startTime: combat.startTime,
                endTime: combat.endTime,
                units: combat.units,
                playerTeamId: combat.playerTeamId,
                playerTeamRating: combat.playerTeamRating,
                result: combat.result,
                hasAdvancedLogging: combat.hasAdvancedLogging,
                rawLines: segment.lines,
                linesNotParsedCount: segment.lines.length - segment.events.length,
                startInfo: nullthrows(combat.startInfo),
                endInfo: nullthrows(combat.endInfo),
              };
              return plainCombatDataObject;
            }
          }
        }

        if (segment.events.length >= 1 && segment.events[0] instanceof ArenaMatchStart) {
          const malformedCombatObject: IMalformedCombatData = {
            dataType: 'MalformedCombat',
            id: computeCanonicalHash(segment.lines),
            isWellFormed: false,
            startTime: segment.events[0].timestamp,
            rawLines: segment.lines,
            linesNotParsedCount: segment.lines.length - segment.events.length,
          };
          return malformedCombatObject;
        }

        return null;
      },
    ),
    filter(isNonNull),
  );
};
