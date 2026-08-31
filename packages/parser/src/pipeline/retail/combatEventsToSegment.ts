import { Observable } from 'rxjs';

import { ArenaMatchEnd } from '../../actions/ArenaMatchEnd';
import { ArenaMatchStart } from '../../actions/ArenaMatchStart';
import { CombatAction } from '../../actions/CombatAction';
import { ZoneChange } from '../../actions/ZoneChange';
import { IActivityStarted } from '../../CombatData';
import { logDebug, logInfo, logTrace } from '../../logger';
import { CombatEvent, ICombatEventSegment, LogEvent } from '../../types';
import { PIPELINE_FLUSH_SIGNAL } from '../../utils';
import { ARENA_PREPARATION_SPELL_ID } from './constants';

const COMBAT_AUTO_TIMEOUT_SECS = 60;
const VALID_BG_ZONE_IDS = [
  30, // | Alterac Valley
  2107, // | Arathi Basin
  529, // | Arathi Basin (Classic)
  1681, // | Arathi Basin (Winter)
  2177, // | Arathi Basin Comp Stomp
  1105, // | Deepwind Gorge
  566, //| Eye of the Storm
  968, //| Eye of the Storm (Rated)
  628, //| Isle of Conquest
  1803, // | Seething Shore
  727, //| Silvershard Mines
  607, //| Strand of the Ancients
  998, //| Temple of Kotmogu
  761, //| The Battle for Gilneas
  726, //| Twin Peaks
  489, //| Warsong Gulch
];

export const combatEventsToSegment = () => {
  return (input: Observable<CombatEvent | string>) => {
    return new Observable<ICombatEventSegment | IActivityStarted>((output) => {
      logTrace('combatEventsToSegment.Observer.Init');
      let lastTimestamp = 0;
      // Zone id of the arena the current buffer's match is being played in (from
      // ARENA_MATCH_START). Used to tell a reconnect/reload back into the same arena
      // (not a boundary) apart from zoning out of the arena (leaver/abort - a boundary).
      let currentArenaZoneId: string | null = null;
      // Whether the current buffer's arena is a solo shuffle round. Only shuffle rounds are
      // cut early on the prep-aura burst - a regular 2v2/3v3 closes on its ARENA_MATCH_END.
      let currentArenaIsShuffle = false;
      // Whether a UNIT_DIED has landed since this arena started. A shuffle round always ends
      // in a kill, so we only treat the next prep-aura burst as a round boundary once we've
      // actually seen the round produce a death.
      let sawDeathInCurrentArena = false;
      let currentBuffer: ICombatEventSegment = {
        events: [],
        lines: [],
        dataType: 'CombatEventSegment',
        hasEmittedStartEvent: false,
      };

      input.subscribe({
        next: (event) => {
          const emitCurrentBuffer = () => {
            currentArenaZoneId = null;
            currentArenaIsShuffle = false;
            sawDeathInCurrentArena = false;
            if (!currentBuffer.lines.length) {
              return;
            }

            output.next(currentBuffer);

            currentBuffer = {
              events: [],
              lines: [],
              dataType: 'CombatEventSegment',
              hasEmittedStartEvent: false,
            };
          };

          if (event === PIPELINE_FLUSH_SIGNAL) {
            logTrace('combatEventsToSegment.FLUSH_SIGNAL');
            emitCurrentBuffer();
            return;
          }

          // this means the line could not be parsed correctly, in which case we
          // still want to store it as raw log in the "lines" buffer.
          if (typeof event === 'string') {
            currentBuffer.lines.push(event);
            return;
          }

          const timeout = event.timestamp - lastTimestamp > COMBAT_AUTO_TIMEOUT_SECS * 1000;

          if (timeout || event instanceof ArenaMatchStart) {
            logTrace(
              `combatEventsToSegment.TIMEOUT|START isStart=${event instanceof ArenaMatchStart} ets=${
                event.timestamp
              } lts=${lastTimestamp} deltaS=${(event.timestamp - lastTimestamp) / 1000}`,
            );
            logTrace(currentBuffer.lines[currentBuffer.lines.length - 1]);
            emitCurrentBuffer();
          }

          if (!currentBuffer.hasEmittedStartEvent) {
            if (event instanceof ArenaMatchStart) {
              logTrace(`combatEventsToSegment.!emitStart|ARENAMATCHSTART isStart=${event instanceof ArenaMatchStart}`);
              logInfo(
                `[combatEventsToSegment] Arena match starting: bracket=${event.bracket} zone=${event.zoneId} ranked=${event.isRanked}`,
              );
              output.next({
                dataType: 'ActivityStarted',
                arenaMatchStartInfo: event,
              });
              currentBuffer.hasEmittedStartEvent = true;
              currentArenaZoneId = event.zoneId;
              currentArenaIsShuffle = event.bracket.endsWith('Solo Shuffle');
            }
            if (event instanceof ZoneChange) {
              if (VALID_BG_ZONE_IDS.includes(event.instanceId)) {
                logTrace('combatEventsToSegment.ZONE_CHANGE');
                output.next({
                  dataType: 'ActivityStarted',
                  bgZoneChange: event,
                });
                currentBuffer.hasEmittedStartEvent = true;
              }
            }
          }

          currentBuffer.events.push(event);
          currentBuffer.lines.push(event.logLine.raw);

          if (event instanceof ArenaMatchEnd) {
            logTrace('combatEventsToSegment.ArenaMatchEnd');
            logInfo(
              `[combatEventsToSegment] Arena match ended: winner=${event.winningTeamId} duration=${event.matchDurationInSeconds}s`,
            );
            emitCurrentBuffer();
          }

          if (
            currentArenaZoneId !== null &&
            event instanceof CombatAction &&
            event.logLine.event === LogEvent.UNIT_DIED
          ) {
            sawDeathInCurrentArena = true;
          }

          // A finished solo shuffle round: the next round's Arena Preparation aura is being
          // applied behind the gates, ~5-6s after the round-ending kill. Cut here (the aura
          // event is already in the buffer, so the decoder still sees it as its draw
          // boundary) instead of waiting for the next round's ARENA_MATCH_START, which only
          // fires when the gates open - that wait is why a finished round used to surface
          // only once the next round began. Rounds 1-5 close here; round 6 has no following
          // prep burst and still closes on ARENA_MATCH_END above.
          if (
            currentArenaIsShuffle &&
            sawDeathInCurrentArena &&
            currentArenaZoneId !== null &&
            event instanceof CombatAction &&
            event.logLine.event === LogEvent.SPELL_AURA_APPLIED &&
            event.spellId === ARENA_PREPARATION_SPELL_ID
          ) {
            logTrace('combatEventsToSegment.ShuffleRoundPrepBurst');
            emitCurrentBuffer();
          }

          if (event instanceof ZoneChange && currentBuffer.lines.length > 1) {
            if (currentArenaZoneId !== null && event.instanceId.toString() === currentArenaZoneId) {
              // Re-entering the arena the current match is in (a reconnect or /reload
              // mid-match): not a boundary. Splitting here would cut the round in half,
              // leaving a deathless fragment that can't be decoded.
              logDebug(`ZoneChange into current arena ${currentArenaZoneId}, not a segment boundary`);
            } else if (currentArenaZoneId !== null) {
              // Zoned OUT of an in-progress arena (leaver / aborted match): always a
              // boundary, even when the destination happens to be a battleground zone.
              logDebug(`Emitting buffer on ZoneChange out of arena linecount=${currentBuffer.lines.length}`);
              emitCurrentBuffer();
            } else if (!VALID_BG_ZONE_IDS.includes(event.instanceId)) {
              logDebug(`Emitting buffer on ZoneChange linecount=${currentBuffer.lines.length}`);
              emitCurrentBuffer();
            }
          }

          lastTimestamp = event.timestamp;
        },
        error: (e) => {
          output.error(e);
        },
        complete: () => {
          output.complete();
        },
      });
    });
  };
};
