import { Observable } from 'rxjs';

import { ArenaMatchEnd } from '../../actions/ArenaMatchEnd';
import { ArenaMatchStart } from '../../actions/ArenaMatchStart';
import { ZoneChange } from '../../actions/ZoneChange';
import { IActivityStarted } from '../../CombatData';
import { logDebug, logTrace } from '../../logger';
import { CombatEvent, ICombatEventSegment, IParseError } from '../../types';

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
  return (input: Observable<CombatEvent | string | IParseError>) => {
    return new Observable<ICombatEventSegment | IActivityStarted | IParseError>((output) => {
      logTrace('combatEventsToSegment.Observer.Init');
      let lastTimestamp = 0;
      let currentBuffer: ICombatEventSegment = {
        events: [],
        lines: [],
        dataType: 'CombatEventSegment',
        hasEmittedStartEvent: false,
      };

      input.subscribe({
        next: (event) => {
          // this means the line could not be parsed correctly, in which case we
          // still want to store it as raw log in the "lines" buffer.
          if (typeof event === 'string') {
            currentBuffer.lines.push(event);
            return;
          }

          const emitCurrentBuffer = () => {
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

          const timeout = event.timestamp - lastTimestamp > COMBAT_AUTO_TIMEOUT_SECS * 1000;

          if (timeout || event instanceof ArenaMatchStart) {
            logTrace(
              `combatEventsToSegment.TIMEOUT|START isStart=${event instanceof ArenaMatchStart} ets=${
                event.timestamp
              } lts=${lastTimestamp}`,
            );
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

          if (event instanceof ZoneChange && currentBuffer.lines.length > 1) {
            logDebug(`Emitting buffer on ZoneChange linecount=${currentBuffer.lines.length}`);
            if (!VALID_BG_ZONE_IDS.includes(event.instanceId)) emitCurrentBuffer();
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
