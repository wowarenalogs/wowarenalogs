import { Observable } from 'rxjs';

import { CombatAction } from '../../actions/CombatAction';
import { ZoneChange } from '../../actions/ZoneChange';
import { logTrace } from '../../logger';
import { CombatEvent, CombatUnitType, ICombatEventSegment, LogEvent } from '../../types';
import { getUnitReaction, getUnitType, PIPELINE_FLUSH_SIGNAL } from '../../utils';

const ARENA_ZONE_IDS = [
  559, // Nagrand Arena
  562, // Blade's Edge Arena
  572, // Ruins of Lordaeron
  617, // Dalaran Arena
  618, // The Ring of Valor
];

type State = 'MATCH_NOT_STARTED' | 'MATCH_STARTED';

function isMatchStartEvent(event: CombatEvent): boolean {
  // combat log is not showing the arena preparation buff, so we have to infer start by
  // looking for the zone changes
  return event instanceof ZoneChange && ARENA_ZONE_IDS.includes(event.instanceId);
}

function isMatchEndEvent(event: CombatEvent): boolean {
  // arena end is inferred by zone changeing into a non-arena zone
  return event instanceof ZoneChange && !ARENA_ZONE_IDS.includes(event.instanceId);
}

export const inferCombatEventSegments = () => {
  return (input: Observable<CombatEvent | string>) => {
    return new Observable<ICombatEventSegment>((output) => {
      let state: State = 'MATCH_NOT_STARTED';
      let currentBuffer: ICombatEventSegment = {
        events: [],
        lines: [],
        dataType: 'CombatEventSegment',
        hasEmittedStartEvent: false,
      };
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
          dataType: 'CombatEventSegment',
          hasEmittedStartEvent: false,
        };
        currentSegmentCombatantIds.clear();
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
          logTrace(`classic.inferCombat evt=${event.logLine.event} state=${state}`);

          switch (state) {
            case 'MATCH_NOT_STARTED':
              // when not in a match, the only event that matters is
              // match start. when that happens we change state to reflect
              // that we are now in a match.
              if (isMatchStartEvent(event)) {
                logTrace(`MATCH STARTED by ${event.logLine.event}`);
                state = 'MATCH_STARTED';
                currentSegmentCombatantIds.add((event as CombatAction).destUnitId);
              } else {
                return;
              }
              break;
            case 'MATCH_STARTED':
              if (isMatchStartEvent(event)) {
                logTrace(`MATCH STARTED by ${event.logLine.event}`);
                if (Math.abs(event.timestamp - currentBuffer.events[0].timestamp) > 5000) {
                  emitCurrentBuffer();
                }
                currentSegmentCombatantIds.add((event as CombatAction).destUnitId);
              } else if (isMatchEndEvent(event)) {
                logTrace('MATCH ENDED by ZONE_CHANGE');
                emitCurrentBuffer();
                state = 'MATCH_NOT_STARTED';
              } else {
                // We cannot currently tell known combatants at the start of the arena because
                // arena preparation buff is not showing up in combat logs. So we just record
                // all combatants. this is not ideal because it could include other
                // combatants (some other events arrive before ZONE_CHANGE involving players in the loading map).
                // This is mitigated by parser trimming the events until the last death event,
                // it remains to be seen if we could finish the arena and get another UNIT_DIED
                // event (from a player in the loading map) before the ZONE_CHANGE event.
                const isSignificantEvent =
                  event instanceof CombatAction &&
                  event.srcUnitId !== event.destUnitId &&
                  getUnitReaction(event.srcUnitFlags) !== getUnitReaction(event.destUnitFlags) &&
                  getUnitType(event.srcUnitFlags) === CombatUnitType.Player &&
                  getUnitType(event.destUnitFlags) === CombatUnitType.Player;

                if (isSignificantEvent) {
                  currentSegmentCombatantIds.add((event as CombatAction).srcUnitId);
                  currentSegmentCombatantIds.add((event as CombatAction).destUnitId);
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
