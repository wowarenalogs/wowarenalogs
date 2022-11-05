import { Observable } from 'rxjs';

import { ArenaMatchEnd } from '../../actions/ArenaMatchEnd';
import { ArenaMatchStart } from '../../actions/ArenaMatchStart';
import { CombatEvent, ICombatEventSegment } from '../../types';

const COMBAT_AUTO_TIMEOUT_SECS = 60;

export const combatEventsToSegment = () => {
  return (input: Observable<CombatEvent | string>) => {
    return new Observable<ICombatEventSegment>((output) => {
      let lastTimestamp = 0;
      let currentBuffer: ICombatEventSegment = { events: [], lines: [] };

      input.subscribe({
        next: (event) => {
          // this means the line could not be parsed correctly, in which case we
          // still want to store it as raw log in the "lines" buffer.
          if (typeof event === 'string') {
            currentBuffer.lines.push(event);
            return;
          }

          // console.log(event.logLine.event);
          // if (event.logLine.event === 'SWING_MISSED') {
          //   console.log(JSON.stringify(event, null, 2));
          // }

          const emitCurrentBuffer = () => {
            if (!currentBuffer.lines.length) {
              return;
            }

            output.next(currentBuffer);

            currentBuffer = {
              events: [],
              lines: [],
            };
          };

          const timeout = event.timestamp - lastTimestamp > COMBAT_AUTO_TIMEOUT_SECS * 1000;

          if (timeout || event instanceof ArenaMatchStart) {
            emitCurrentBuffer();
          }

          currentBuffer.events.push(event);
          currentBuffer.lines.push(event.logLine.raw);

          if (event instanceof ArenaMatchEnd) {
            emitCurrentBuffer();
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
