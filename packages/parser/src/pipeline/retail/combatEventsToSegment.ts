import { Observable } from 'rxjs';

import { ArenaMatchEnd } from '../../actions/ArenaMatchEnd';
import { ArenaMatchStart } from '../../actions/ArenaMatchStart';
import { CombatAction } from '../../actions/CombatAction';
import { ZoneChange } from '../../actions/ZoneChange';
import { IActivityStarted } from '../../CombatData';
import { logDebug, logTrace } from '../../logger';
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
      let currentArenaZoneId: string | null = null;
      let currentArenaIsShuffle = false;
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
            emitCurrentBuffer();
          }

          if (
            currentArenaZoneId !== null &&
            event instanceof CombatAction &&
            event.logLine.event === LogEvent.UNIT_DIED
          ) {
            sawDeathInCurrentArena = true;
          }

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
              logDebug(`ZoneChange into current arena ${currentArenaZoneId}, not a segment boundary`);
            } else if (currentArenaZoneId !== null) {
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
