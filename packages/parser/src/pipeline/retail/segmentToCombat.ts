import { pipe } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import { ArenaMatchEnd, ArenaMatchEndInfo } from '../../actions/ArenaMatchEnd';
import { ArenaMatchStart, ArenaMatchStartInfo } from '../../actions/ArenaMatchStart';
import { CombatAction } from '../../actions/CombatAction';
import { ZoneChange } from '../../actions/ZoneChange';
import { BattlegroundData } from '../../BattlegroundData';
import {
  CombatData,
  IActivityStarted,
  IArenaMatch,
  IBattlegroundCombat,
  IMalformedCombatData,
  IShuffleMatch,
  IShuffleRound,
} from '../../CombatData';
import { logDebug, logInfo, logTrace } from '../../logger';
import { CombatResult, CombatUnitType, ICombatEventSegment, LogEvent } from '../../types';
import { computeCanonicalHash, nullthrows } from '../../utils';
import { isNonNull } from '../common/utils';
import { ARENA_PREPARATION_SPELL_ID, SHUFFLE_DRAW_WINDOW_MS, SHUFFLE_ROSTER_SIZE } from './constants';

// Buffer of recent shuffle rounds while a shuffle match is in progress; reset once a
// shuffle-ending is detected.
interface IShuffleTracker {
  rounds: IShuffleRound[];
  scoreboard: IShuffleRound['scoreboard'];
}

function resetShuffleTracker(tracker: IShuffleTracker) {
  tracker.rounds = [];
  tracker.scoreboard = [];
}

function recordOutcomeToScoreboard(scoreboard: IShuffleRound['scoreboard'], unitId: string, didWin: boolean) {
  const score = scoreboard.find((u) => u.unitId === unitId);
  if (!score) {
    scoreboard.push({
      unitId,
      wins: didWin ? 1 : 0,
    });
  } else {
    score.wins = didWin ? score.wins + 1 : score.wins;
  }
}

function rosterOf(units: IShuffleRound['units']): string[] {
  return Object.values(units)
    .filter((u) => u.type === CombatUnitType.Player)
    .map((u) => u.id)
    .sort();
}

function roundsBelongToSameMatch(roundA: ArenaMatchStartInfo, roundB: ArenaMatchStartInfo) {
  // ARENA_MATCH_START is identical for every round of a shuffle except the timestamp
  if (roundA.bracket !== roundB.bracket) return false;
  if (roundA.isRanked !== roundB.isRanked) return false;
  if (roundA.item1 !== roundB.item1) return false;
  if (roundA.zoneId !== roundB.zoneId) return false;
  return true;
}

// Used only when the match's ARENA_MATCH_END never arrived; mirrors how Blizzard reports
// the result, framed against the team the player was on for the final round.
function deriveShuffleResultFromScoreboard(
  playerId: string,
  playerTeamId: string,
  scoreboard: IShuffleRound['scoreboard'],
): { result: CombatResult; winningTeamId: string } {
  const personalWins = scoreboard.find((s) => s.unitId === playerId)?.wins ?? 0;
  const otherTeamId = playerTeamId === '0' ? '1' : '0';

  if (personalWins > 3) {
    return { result: CombatResult.Win, winningTeamId: playerTeamId };
  }
  if (personalWins < 3) {
    return { result: CombatResult.Lose, winningTeamId: otherTeamId };
  }
  // '' means drawn, as IShuffleRound.winningTeamId does. It is uploaded verbatim, so naming a
  // winner here would report the losing team as the victor of a 3-3.
  return { result: CombatResult.DrawGame, winningTeamId: '' };
}

// TODO: Handle case where a round is accidentally ingested twice; timestamp will match
// something already in buffer

// Some sanity checks before we report this shuffle
function validateRounds(rounds: IShuffleRound[]) {
  // Must contain 6 rounds
  if (rounds.length !== 6) {
    logInfo(`validateRounds length != 6 (${rounds.length})`);
    return false;
  }

  for (let i = 1; i < 6; i++) {
    if (!roundsBelongToSameMatch(rounds[i].startInfo, rounds[0].startInfo)) {
      logInfo(`validateRounds ${i} => false`);
      return false;
    }
    // Rounds of one match are strictly sequential, so going backwards means the buffer spans
    // two matches - which the startInfo check above cannot see on the same map.
    if (rounds[i].startTime < rounds[i - 1].endTime) {
      logInfo(
        `validateRounds ${i} not contiguous (starts ${rounds[i].startTime}, prev ended ${rounds[i - 1].endTime})`,
      );
      return false;
    }
  }
  return true;
}

function decodeShuffleRound(segment: ICombatEventSegment, tracker: IShuffleTracker, timezone: string) {
  // a segment was emitted that looks valid but does not end with ArenaMatchEnd
  // assume this is a solo shuffle round
  const combat = new CombatData('retail', timezone);
  combat.startTime = segment.events[0].timestamp || 0;
  segment.events.forEach((e) => {
    combat.readEvent(e);
  });
  combat.end();

  if (tracker.rounds.length == 6) {
    // Panic: Already 6 rounds in the buffer, this cant be the same solo shuffle match
    logInfo(`decodeShuffle panic 1 - rounds length=${tracker.rounds.length}`);
    resetShuffleTracker(tracker);
  }

  if (
    tracker.rounds.length > 0 &&
    !roundsBelongToSameMatch(tracker.rounds[0].startInfo, nullthrows(combat.startInfo))
  ) {
    logInfo(`decodeShuffle panic 2 - rounds length=${tracker.rounds.length}`);
    // Panic: New round does not appear to be a member of the solo shuffle match
    resetShuffleTracker(tracker);
  }

  if (tracker.rounds.length > 0 && combat.startTime < tracker.rounds[tracker.rounds.length - 1].endTime) {
    // Panic: starts before the buffered round ended, so it belongs to a different match.
    logInfo(
      `decodeShuffle panic 3 - round starts ${combat.startTime}, previous round ended ${
        tracker.rounds[tracker.rounds.length - 1].endTime
      }`,
    );
    resetShuffleTracker(tracker);
  }

  const players = Object.values(combat.units).filter((a) => a.type === CombatUnitType.Player);

  if (tracker.rounds.length > 0 && players.length === SHUFFLE_ROSTER_SIZE) {
    // Panic: a different roster means a different match. The only signal that catches quitting
    // and requeueing, which produces no zone change and rounds that are later in time. Judged
    // only on complete rosters, since a reload can leave a round short.
    const bufferedRoster = rosterOf(tracker.rounds[tracker.rounds.length - 1].units);
    const roster = players.map((u) => u.id).sort();
    if (bufferedRoster.length === SHUFFLE_ROSTER_SIZE && bufferedRoster.join() !== roster.join()) {
      logInfo(`decodeShuffle panic 4 - roster changed, rounds length=${tracker.rounds.length}`);
      resetShuffleTracker(tracker);
    }
  }

  // The first conscious death ends the round; deathRecords already excludes feign and
  // "unconscious at death" records.
  const allDeaths = players
    .flatMap((unit) => unit.deathRecords.map((logLine) => ({ unit, logLine })))
    .sort((a, b) => a.logLine.timestamp - b.logLine.timestamp);

  if (allDeaths.length === 0) {
    throw new Error('No player deaths found in segment, cannot decode shuffle round');
  }

  const firstDeath = allDeaths[0];
  const deadPlayerId = firstDeath.unit.id;
  const losingTeam = combat.units[deadPlayerId].info?.teamId;

  if (typeof losingTeam !== 'string') {
    throw new Error('Could not determine winners of shuffle round');
  }

  // An opposite-team death close behind the deciding one is a draw. The round ends at the first
  // prep aura, match end, or zone-out after it (events are chronological), capped by the draw
  // window so the rule does not vary with whatever closed the segment.
  const roundEndEvent = segment.events.find(
    (e) =>
      e.timestamp > firstDeath.logLine.timestamp &&
      ((e instanceof CombatAction &&
        e.logLine.event === LogEvent.SPELL_AURA_APPLIED &&
        e.spellId === ARENA_PREPARATION_SPELL_ID) ||
        e instanceof ArenaMatchEnd ||
        e instanceof ZoneChange),
  );
  const roundEndBoundary = Math.min(
    roundEndEvent ? roundEndEvent.timestamp : Infinity,
    firstDeath.logLine.timestamp + SHUFFLE_DRAW_WINDOW_MS,
  );
  const isDraw = allDeaths.some((d) => d.logLine.timestamp < roundEndBoundary && d.unit.info?.teamId !== losingTeam);

  players.forEach((unit) => {
    recordOutcomeToScoreboard(tracker.scoreboard, unit.id, !isDraw && unit.info?.teamId !== losingTeam);
  });

  const result = isDraw
    ? CombatResult.DrawGame
    : combat.playerTeamId === losingTeam
      ? CombatResult.Lose
      : CombatResult.Win;

  const endTime = combat.endInfo ? combat.endInfo.timestamp : firstDeath.logLine.timestamp;

  const rv: IShuffleRound = {
    id: computeCanonicalHash(segment.lines),
    wowVersion: 'retail',
    dataType: 'ShuffleRound',
    startInfo: nullthrows(combat.startInfo),
    units: combat.units,
    events: combat.events,
    rawLines: segment.lines,
    linesNotParsedCount: combat.linesNotParsedCount,
    // '' means the round was drawn
    winningTeamId: isDraw ? '' : losingTeam === '0' ? '1' : '0',
    killedUnitId: deadPlayerId,
    scoreboard: tracker.scoreboard.map((s) => ({ ...s })),
    sequenceNumber: tracker.rounds.length,
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

  tracker.rounds.push(rv);
  return {
    shuffle: rv,
    combat,
  };
}

export const segmentToCombat = () => {
  const tracker: IShuffleTracker = {
    rounds: [],
    scoreboard: [],
  };

  return pipe(
    map(
      (
        segment: ICombatEventSegment | IActivityStarted,
      ):
        | IArenaMatch
        | IMalformedCombatData
        | IShuffleRound
        | IShuffleMatch
        | IBattlegroundCombat
        | IActivityStarted
        | null => {
        try {
          const result = segmentToCombatInner(segment, tracker);
          // Leaving the arena ends the match, and two shuffles are always separated by a zone
          // change. After decoding, so a final partial round still reports against its own match.
          if (
            segment.dataType === 'CombatEventSegment' &&
            segment.endReason === 'ZoneChangeOut' &&
            tracker.rounds.length > 0
          ) {
            logInfo(`segmentToCombat: left the arena holding ${tracker.rounds.length} round(s), resetting tracker`);
            resetShuffleTracker(tracker);
          }
          return result;
        } catch (e) {
          logInfo(`segmentToCombat: dropping a segment that failed to process: ${String(e)}`);
          return null;
        }
      },
    ),
    filter(isNonNull),
  );
};

function segmentToCombatInner(
  segment: ICombatEventSegment | IActivityStarted,
  tracker: IShuffleTracker,
): IArenaMatch | IMalformedCombatData | IShuffleRound | IShuffleMatch | IBattlegroundCombat | IActivityStarted | null {
  // Pass-through events that aren't relevant to the combat generation process
  if (segment.dataType == 'ActivityStarted') {
    return segment;
  }

  if (segment.events.length === 0) {
    return null;
  }

  const firstEvent = segment.events[0];
  const lastEvent = segment.events[segment.events.length - 1];

  logDebug(`First segment event: ${firstEvent.logLine.raw.slice(0, 17)} ${firstEvent.logLine.event}`);
  logDebug(`Last segment event: ${lastEvent.logLine.raw.slice(0, 17)} ${lastEvent.logLine.event}`);

  // Length check here is because if there is a buffer with only 1 event (zonechange)
  //  that is technically the first and last event
  if (segment.events.length > 1 && firstEvent instanceof ZoneChange && lastEvent instanceof ZoneChange) {
    const bg = new BattlegroundData('retail', segment.events[0].logLine.timezone);

    logInfo(`Decoding bg with ${segment.events.length} events`);
    bg.startTime = segment.events[0].timestamp || 0;
    segment.events.forEach((e) => {
      bg.readEvent(e);
    });
    bg.end();

    return {
      id: computeCanonicalHash(segment.lines),
      dataType: 'BattlegroundCombat',
      wowVersion: 'retail',
      timezone: segment.events[0].logLine.timezone,
      zoneInEvent: firstEvent,
      zoneOutEvent: lastEvent,
      units: bg.units,
      events: bg.events,
      rawLines: segment.lines,
      startTime: firstEvent.timestamp,
      endTime: lastEvent.timestamp,
    };
  }

  const isShuffleRound =
    segment.events.length >= 3 &&
    segment.events[0] instanceof ArenaMatchStart &&
    segment.events[0].bracket.endsWith('Solo Shuffle') &&
    !(segment.events[segment.events.length - 1] instanceof ArenaMatchEnd);

  const metadataLooksGood =
    segment.events.length >= 3 &&
    segment.events[0] instanceof ArenaMatchStart &&
    segment.events[segment.events.length - 1] instanceof ArenaMatchEnd;

  logInfo(`segmentToCombat isShuffle=${isShuffleRound} metadataOK=${metadataLooksGood}`);

  logTrace(
    `Metadata check good=${metadataLooksGood} isShuffleRound=${isShuffleRound} events=${
      segment.events.length
    } e0=${segment.events[0].logLine.event} e0=${
      segment.events[0].logLine.timestamp
    } e0=${segment.events[0].logLine.raw.slice(0, 50)} eLast=${
      segment.events[segment.events.length - 1].logLine.event
    } eLast=${segment.events[segment.events.length - 1].logLine.raw.slice(0, 50)}`,
  );
  if (isShuffleRound) {
    try {
      const decoded = decodeShuffleRound(segment, tracker, segment.events[0].logLine.timezone);
      logTrace(`Emitting shuffle round ${segment.events[0].timestamp} ${segment.events[0].logLine.raw.slice(0, 50)}`);

      // A flush landing on round 6: the match is complete even without ARENA_MATCH_END.
      if (validateRounds(tracker.rounds)) {
        const { result, winningTeamId } = deriveShuffleResultFromScoreboard(
          decoded.combat.playerId,
          decoded.combat.playerTeamId,
          tracker.scoreboard,
        );
        const endInfo: ArenaMatchEndInfo = {
          timestamp: decoded.shuffle.endTime,
          winningTeamId,
          matchDurationInSeconds: (decoded.shuffle.endTime - tracker.rounds[0].startTime) / 1000,
          team0MMR: 0,
          team1MMR: 0,
        };
        const shuf: IShuffleMatch = {
          wowVersion: 'retail',
          dataType: 'ShuffleMatch',
          id: decoded.shuffle.id,
          startTime: tracker.rounds[0].startTime,
          endTime: decoded.shuffle.endTime,
          result,
          startInfo: nullthrows(decoded.combat.startInfo),
          endInfo,
          rounds: [...tracker.rounds],
          durationInSeconds: endInfo.matchDurationInSeconds,
          timezone: decoded.combat.timezone,
        };
        resetShuffleTracker(tracker);
        return shuf;
      }

      return decoded.shuffle;
    } catch (e) {
      logInfo('Decoder fail');
      logInfo(e);
      // A round we could not decode leaves a partial match buffered, which the next match's
      // rounds would top up to 6. Drop it, as the ARENA_MATCH_END path does.
      resetShuffleTracker(tracker);
    }
  }

  if (metadataLooksGood) {
    if (segment.events[0] instanceof ArenaMatchStart && segment.events[0].bracket.endsWith('Solo Shuffle')) {
      try {
        logInfo(`final shuffle round decode starting`);
        const decoded = decodeShuffleRound(segment, tracker, segment.events[0].logLine.timezone);
        const validRounds = validateRounds(tracker.rounds);

        logInfo(`final shuffle round validRounds=${validRounds}`);
        if (validRounds) {
          const shuf: IShuffleMatch = {
            wowVersion: 'retail',
            dataType: 'ShuffleMatch',
            id: decoded.shuffle.id, // Using id of last round
            startTime: tracker.rounds[0].startTime,
            endTime: decoded.combat.endTime,
            result: decoded.combat.result,
            startInfo: nullthrows(decoded.combat.startInfo),
            endInfo: nullthrows(decoded.combat.endInfo),
            rounds: [...tracker.rounds],
            durationInSeconds: (decoded.combat.endTime - tracker.rounds[0].startTime) / 1000,
            timezone: decoded.combat.timezone,
          };
          resetShuffleTracker(tracker);
          return shuf;
        } else {
          // We hit a final round (ARENA_MATCH_END) but the Match itself wasn't a valid 6-round shuffle
          // We want to emit the shuffle as a round but then reset the internal match aggregator
          resetShuffleTracker(tracker);
          return decoded.shuffle;
        }
      } catch (e) {
        // Reset buffer also if rounds are invalid...
        resetShuffleTracker(tracker);
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

  if (segment.events.length >= 3 && segment.events[0] instanceof ArenaMatchStart) {
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

  return null;
}
