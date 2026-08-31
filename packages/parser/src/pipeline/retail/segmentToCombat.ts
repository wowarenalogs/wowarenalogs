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
import { ARENA_PREPARATION_SPELL_ID } from './constants';

// Buffer of recent shuffle rounds while a shuffle match is in progress; reset once a
// shuffle-ending is detected. One tracker exists per pipeline instance (created inside
// segmentToCombat) so that concurrent parsers - e.g. the live log watcher and a manual
// file import running at the same time - can't contaminate each other's match state.
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

function roundsBelongToSameMatch(roundA: ArenaMatchStartInfo, roundB: ArenaMatchStartInfo) {
  // ARENA_MATCH_START is identical for every round of a shuffle except the timestamp
  if (roundA.bracket !== roundB.bracket) return false;
  if (roundA.isRanked !== roundB.isRanked) return false;
  if (roundA.item1 !== roundB.item1) return false;
  if (roundA.zoneId !== roundB.zoneId) return false;
  return true;
}

// Derives the overall shuffle result for the recording player when the match's real
// ARENA_MATCH_END line never arrived (e.g. the game/app was closed right after the last
// round finished, or the log stream was force-flushed on an idle timeout). Blizzard's own
// ARENA_MATCH_END reports this using the final round's team framing, so we do the same:
// tally the recording player's personal round wins and map Win/Lose/Draw onto whichever
// team they were on for round 6.
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
  return { result: CombatResult.DrawGame, winningTeamId: otherTeamId };
}

// NOTE: unlike solo shuffle rounds (exactly one death always ends a round in a well-defined
// way), a regular arena match's real end condition isn't simply "one team fully wiped" -
// verified against hunter_priest_match.txt, where the match ended with the losing team's
// second player still alive. There's no reliable way to reconstruct a regular match's
// winner from combat data alone when its ARENA_MATCH_END line is missing, so unlike the
// shuffle case, we don't attempt to recover one - it's reported as malformed instead of
// risking a confidently wrong result.

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

  const players = Object.values(combat.units).filter((a) => a.type === CombatUnitType.Player);

  // Every shuffle round ends in a kill - there is no round timer. The first conscious
  // player death ends the round; deathRecords already excludes feign/"unconscious at
  // death" records, which land in consciousDeathRecords instead. A holy priest entering
  // Spirit of Redemption/Restitution (aura 215769/211319) needs no handling here: the
  // combat log emits NO UNIT_DIED at all for the pseudo-death (verified against live
  // logs - 7 SoR procs, zero UNIT_DIED), only a real death later, if one happens.
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

  // A round is a DRAW when both teams lose a player in extremely short succession - a
  // second kill landing before the game has closed out the round. The game's own "round
  // is over" signal in the log is the Arena Preparation aura (32727) being applied to the
  // players for the next round's prep, ~5-6s after the round-ending kill. So: any
  // opposite-team death that lands after the first death but before the next prep aura
  // (or, when no prep burst exists in the segment - final round, aborted match, flush -
  // before the segment ends) means neither team won the round.
  const nextPrepEvent = segment.events.find(
    (e) =>
      e instanceof CombatAction &&
      e.logLine.event === LogEvent.SPELL_AURA_APPLIED &&
      e.spellId === ARENA_PREPARATION_SPELL_ID &&
      e.timestamp > firstDeath.logLine.timestamp,
  );
  const roundEndBoundary = nextPrepEvent ? nextPrepEvent.timestamp : Infinity;
  const isDraw = allDeaths.some((d) => d.logLine.timestamp < roundEndBoundary && d.unit.info?.teamId !== losingTeam);

  players.forEach((unit) => {
    // In a draw, nobody gets credit for a round win
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
    // '' encodes a drawn round - consumers render team highlights only when this matches
    // a real team id, so a draw simply highlights neither team
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
        // This whole body is wrapped because a single malformed/unexpected segment (e.g. a
        // ZoneChange-bounded segment that unexpectedly contains a CombatantInfoAction, which
        // BattlegroundData.readEvent treats as an invariant violation and throws on) used to
        // propagate out of this map() and terminate the entire rxjs subscription - silently
        // killing match detection for the rest of the session, not just the one bad segment.
        // Dropping just this segment is far better than losing everything after it.
        try {
          return segmentToCombatInner(segment, tracker);
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

  // The bracket check matters here, not just for the metadataLooksGood branch below: without
  // it, a flush-terminated regular 2v2/3v3 match (ArenaMatchStart, some deaths, no
  // ArenaMatchEnd) satisfies this condition too, and decodeShuffleRound's death-based
  // decoding can spuriously succeed on a real arena match's data, misreporting it as a
  // ShuffleRound instead of the ArenaMatch it actually is.
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

      // This segment ended without a real ARENA_MATCH_END (e.g. the pipeline was
      // force-flushed because the app quit or the log went idle right after the
      // final round). If that flush happened to land exactly on the 6th round, the
      // match itself is complete even though we never saw the closing log line for
      // it - build the ShuffleMatch here instead of losing it as a lone round.
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

  // Same >= 3 threshold as isShuffleRound/metadataLooksGood above: a segment with only
  // the ArenaMatchStart line and nothing else isn't malformed data, it's just an empty
  // round that got force-flushed (e.g. app quit right as the next round's marker was
  // written but before any real combat happened) - there's nothing to report.
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
