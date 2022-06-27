import { Observable } from 'rxjs';

import { CombatAction } from '../../actions/CombatAction';
import { CombatEvent, CombatUnitType, ICombatEventSegment, LogEvent } from '../../types';
import { getUnitReaction, getUnitType, PIPELINE_FLUSH_SIGNAL } from '../../utils';

const COMBAT_AUTO_TIMEOUT_SECS = 60;

type State = 'MATCH_NOT_STARTED' | 'MATCH_STARTED';

export const inferCombatEventSegments = () => {
  return (input: Observable<CombatEvent | string>) => {
    return new Observable<ICombatEventSegment>((output) => {
      let state: State = 'MATCH_NOT_STARTED';
      let lastSignificantEventTime = 0;
      let currentBuffer: ICombatEventSegment = { events: [], lines: [] };
      const currentSegmentCombatantIds = new Set<string>();

      const emitCurrentBuffer = () => {
        if (!currentBuffer.lines.length) {
          return;
        }

        // find the last death event from a known combatant
        // and treat that as the last event of the segment
        let i = currentBuffer.events.length - 1;
        for (; i >= 0; --i) {
          const event = currentBuffer.events[i];
          if (
            event instanceof CombatAction &&
            event.logLine.event === LogEvent.UNIT_DIED &&
            currentSegmentCombatantIds.has(event.destUnitId)
          ) {
            break;
          }
        }
        if (i > 0) {
          currentBuffer.events = currentBuffer.events.slice(0, i + 1);
          output.next(currentBuffer);
        }

        currentBuffer = {
          events: [],
          lines: [],
        };
        currentSegmentCombatantIds.clear();
        lastSignificantEventTime = 0;
      };

      input.subscribe({
        next: (event) => {
          if (typeof event === 'string') {
            if (event === PIPELINE_FLUSH_SIGNAL && state === 'MATCH_STARTED') {
              emitCurrentBuffer();
              state = 'MATCH_NOT_STARTED';
            } else {
              // this means the line could not be parsed correctly, in which case we
              // still want to store it as raw log in the "lines" buffer.
              currentBuffer.lines.push(event);
            }
            return;
          }

          const isMatchStartEvent =
            event instanceof CombatAction &&
            event.logLine.event === LogEvent.SPELL_AURA_REMOVED &&
            getUnitType(event.destUnitFlags) === CombatUnitType.Player &&
            event.spellId === '32727'; // arena preparation buff

          switch (state) {
            case 'MATCH_NOT_STARTED':
              // when not in a match, the only event that matters is
              // match start. when that happens we change state to reflect
              // that we are now in a match.
              if (isMatchStartEvent) {
                state = 'MATCH_STARTED';
                currentSegmentCombatantIds.add((event as CombatAction).destUnitId);
                lastSignificantEventTime = event.timestamp;
              } else {
                return;
              }
              break;
            case 'MATCH_STARTED':
              if (isMatchStartEvent) {
                if (Math.abs(event.timestamp - currentBuffer.events[0].timestamp) > 5000) {
                  emitCurrentBuffer();
                }
                currentSegmentCombatantIds.add((event as CombatAction).destUnitId);
                lastSignificantEventTime = event.timestamp;
              } else if (event.timestamp - lastSignificantEventTime > COMBAT_AUTO_TIMEOUT_SECS * 1000) {
                emitCurrentBuffer();
                state = 'MATCH_NOT_STARTED';
              } else {
                // a significant event is an interaction between two players from
                // different teams and one of them is a known combatant.
                const isSignificantEvent =
                  event instanceof CombatAction &&
                  event.srcUnitId !== event.destUnitId &&
                  getUnitReaction(event.srcUnitFlags) !== getUnitReaction(event.destUnitFlags) &&
                  getUnitType(event.srcUnitFlags) === CombatUnitType.Player &&
                  getUnitType(event.destUnitFlags) === CombatUnitType.Player &&
                  (currentSegmentCombatantIds.has(event.srcUnitId) || currentSegmentCombatantIds.has(event.destUnitId));
                if (isSignificantEvent) {
                  currentSegmentCombatantIds.add((event as CombatAction).srcUnitId);
                  currentSegmentCombatantIds.add((event as CombatAction).destUnitId);
                  lastSignificantEventTime = event.timestamp;
                }
              }
              break;
          }

          if (state === 'MATCH_STARTED') {
            currentBuffer.events.push(event);
            currentBuffer.lines.push(event.logLine.raw);
          }
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
