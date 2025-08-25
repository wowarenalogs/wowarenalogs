import { CombatExtraSpellAction, getClassColor, ICombatUnit, LogEvent } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useMemo } from 'react';

import { SpecImage } from '../../common/SpecImage';
import { useCombatReportContext } from '../CombatReportContext';
import { AuraEvent, InterruptEvent, SpellCastEvent } from './components';
import { getLogLineId, IAuraEvent, IInterruptEvent, ISpellCastTimelineEvent } from './utils';

const SPELL_ICON_SIZE = 24;
const COLUMN_WIDTH = 240;
const EVENT_CARD_HEIGHT = 48; // height of each event card
const CROSS_COLUMN_SPACING = 12; // spacing when events are in different columns
const EVENT_TIME_SPACING_CHUNK = 24; // extra padding when events are >1s apart chronologically

// Layout spacing constants
const COLUMN_SEPARATOR_MARGIN = 8; //margin on each side of separator
const HEADER_BOTTOM_MARGIN = 12; // margin below headers
const EVENT_HORIZONTAL_PADDING = 0; // for event cards

interface IProps {
  selectedPlayers: ICombatUnit[];
  showSpells: boolean;
  showAuras: boolean;
  showInterrupts: boolean;
}

export const MultiPlayerTimeline = ({ selectedPlayers, showSpells, showAuras, showInterrupts }: IProps) => {
  const { combat } = useCombatReportContext();

  // Create a global chronological timeline with position assignments
  const globalTimeline = useMemo(() => {
    if (!combat) return { allEvents: [], eventsByPlayer: new Map(), positionMap: new Map() };

    // Collect all events from all players
    const allGlobalEvents: Array<(ISpellCastTimelineEvent | IAuraEvent | IInterruptEvent) & { playerId: string }> = [];

    // Track last spell cast timestamp for each player to calculate deltas
    const lastSpellCastByPlayer = new Map<string, number>();

    selectedPlayers.forEach((player) => {
      // Add spell events
      if (showSpells) {
        // Sort player's spell events by timestamp to calculate deltas correctly
        const sortedSpellEvents = [...player.spellCastEvents].sort((a, b) => a.timestamp - b.timestamp);

        sortedSpellEvents.forEach((event) => {
          if (event.spellId && event.spellName) {
            // Skip spell cast failed events
            if (event.logLine?.event === LogEvent.SPELL_CAST_FAILED) {
              return;
            }

            // Calculate delta from last spell cast for this player
            const lastCastTime = lastSpellCastByPlayer.get(player.id);
            const deltaMs = lastCastTime ? event.timestamp - lastCastTime : undefined;

            // Update last cast time for this player
            lastSpellCastByPlayer.set(player.id, event.timestamp);

            allGlobalEvents.push({
              type: 'spellcast',
              spellId: event.spellId,
              spellName: event.spellName,
              timestamp: event.timestamp,
              timeOffset: event.timestamp - combat.startTime,
              event: event.logLine?.event as LogEvent,
              succeeded: event.logLine?.event === LogEvent.SPELL_CAST_SUCCESS,
              targetName: event.destUnitName,
              targetId: event.destUnitId,
              playerId: player.id,
              logLine: event.logLine,
              deltaMs,
            });
          }
        });
      }

      // Add aura events
      if (showAuras) {
        player.auraEvents.forEach((event) => {
          if (event.spellId && event.spellName) {
            const isApplied =
              event.logLine.event === 'SPELL_AURA_APPLIED' || event.logLine.event === 'SPELL_AURA_APPLIED_DOSE';
            const isRemoved =
              event.logLine.event === 'SPELL_AURA_REMOVED' || event.logLine.event === 'SPELL_AURA_REMOVED_DOSE';

            if (isApplied || isRemoved) {
              allGlobalEvents.push({
                type: 'aura',
                spellId: event.spellId,
                spellName: event.spellName,
                timestamp: event.timestamp,
                timeOffset: event.timestamp - combat.startTime,
                event: isApplied ? 'applied' : 'removed',
                sourceUnit: event.srcUnitName,
                playerId: player.id,
                logLine: event.logLine,
              });
            }
          }
        });
      }
    });

    // Add interrupt events from player action data
    if (showInterrupts) {
      selectedPlayers.forEach((player) => {
        // Add interrupt events where this player interrupted someone
        player.actionOut.forEach((action) => {
          if (action.logLine.event === LogEvent.SPELL_INTERRUPT) {
            const castAction = action as CombatExtraSpellAction;

            const spellId = castAction.spellId;
            const spellName = castAction.spellName;
            const interruptedSpellId = castAction.extraSpellId;
            const interruptedSpellName = castAction.extraSpellName;

            if (spellId && spellName && interruptedSpellId && interruptedSpellName) {
              // Event for the interrupter
              allGlobalEvents.push({
                type: 'interrupt',
                spellId,
                spellName,
                interruptedSpellId,
                interruptedSpellName,
                timestamp: action.timestamp,
                timeOffset: action.timestamp - combat.startTime,
                playerId: player.id, // This player interrupted someone
                targetId: action.destUnitId,
                logLine: action.logLine,
              });

              // Also create an event for the interrupted player if they're in our selected players
              const interruptedPlayer = selectedPlayers.find((p) => p.id === action.destUnitId);
              if (interruptedPlayer) {
                allGlobalEvents.push({
                  type: 'interrupt',
                  spellId,
                  spellName,
                  interruptedSpellId,
                  interruptedSpellName,
                  timestamp: action.timestamp,
                  timeOffset: action.timestamp - combat.startTime,
                  playerId: action.destUnitId, // The interrupted player
                  targetId: player.id, // The interrupter
                  logLine: action.logLine,
                });
              }
            }
          }
        });
      });
    }

    // Sort all events globally by timestamp
    const sortedGlobalEvents = _.sortBy(allGlobalEvents, 'timestamp');

    // Create position map using smart spacing algorithm
    const positionMap = new Map<string, number>(); // event key -> y position
    const eventsByPlayer = new Map<string, Array<ISpellCastTimelineEvent | IAuraEvent | IInterruptEvent>>();

    // Initialize player event arrays
    selectedPlayers.forEach((player) => {
      eventsByPlayer.set(player.id, []);
    });

    // Calculate positions using low water mark algorithm
    // Track the minimum Y position where we can place the next event for each column
    const columnLowWaterMarks = new Map<string, number>();
    selectedPlayers.forEach((player) => {
      columnLowWaterMarks.set(player.id, 0);
    });

    let globalMinY = 0; // The minimum Y across all columns for chronological ordering
    let lastEventTimestamp = 0; // Track timestamp of last event placed
    let lastEventY = 0; // Track Y position of last event placed
    let lastEventColumn = ''; // Track which column the last event was in

    // Track duplicate keys to log them
    const keyTracker = new Map<
      string,
      Array<(ISpellCastTimelineEvent | IAuraEvent | IInterruptEvent) & { playerId: string }>
    >();

    sortedGlobalEvents.forEach((event, index) => {
      // Use the original log line ID as the event key for uniqueness
      const logLineId = getLogLineId(event, index);
      const eventKey = `${event.playerId}-${logLineId}`;
      const playerId = event.playerId;

      // Track this key for duplicate detection
      if (!keyTracker.has(eventKey)) {
        keyTracker.set(eventKey, []);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      keyTracker.get(eventKey)!.push(event);

      // Get the current low water mark for this column
      const columnMinY = columnLowWaterMarks.get(playerId) ?? 0;

      // Check if we need to add extra spacing due to time gap
      let extraTimeSpacing = 0;
      if (lastEventTimestamp > 0 && event.timestamp - lastEventTimestamp > 1000) {
        const del = Math.round((event.timestamp - lastEventTimestamp) / 1000);
        extraTimeSpacing = del * EVENT_TIME_SPACING_CHUNK;
      }

      // If this event has the same timestamp as the previous event AND was in a different column, use the same Y position
      let eventY: number;
      if (lastEventTimestamp > 0 && event.timestamp === lastEventTimestamp && lastEventColumn !== playerId) {
        eventY = lastEventY;
      } else {
        // The event must be placed at least at the global minimum Y (for chronological order)
        // and at least at the column's low water mark (to avoid overlaps in the same column)
        // plus any extra time-based spacing
        eventY = Math.max(globalMinY + extraTimeSpacing, columnMinY + extraTimeSpacing);
      }

      // Update the low water mark for this column
      columnLowWaterMarks.set(playerId, eventY + EVENT_CARD_HEIGHT);

      // Update the global minimum Y for the next event
      globalMinY = eventY + CROSS_COLUMN_SPACING;

      // Update last event timestamp, Y position, and column
      lastEventTimestamp = event.timestamp;
      lastEventY = eventY;
      lastEventColumn = playerId;

      positionMap.set(eventKey, eventY);
      // Store the eventKey in the event for later use in rendering
      event.eventKey = eventKey;
      eventsByPlayer.get(event.playerId)?.push(event);
    });

    return {
      allEvents: sortedGlobalEvents,
      eventsByPlayer,
      positionMap,
    };
  }, [selectedPlayers, combat, showSpells, showAuras, showInterrupts]);

  // Calculate total height needed based on the last event position
  const totalHeight = useMemo(() => {
    if (globalTimeline.allEvents.length === 0) return 200;

    // Find the maximum Y position
    let maxY = 0;
    const positions = Array.from(globalTimeline.positionMap.values());
    for (const yPos of positions) {
      maxY = Math.max(maxY, yPos);
    }

    return Math.max(maxY + EVENT_CARD_HEIGHT, 200); // Add one card height for the last event
  }, [globalTimeline.positionMap, globalTimeline.allEvents.length]);

  if (!combat || selectedPlayers.length === 0) {
    return <div className="text-center py-8 opacity-60">Select players to view their timeline</div>;
  }

  const renderEvent = (event: ISpellCastTimelineEvent | IAuraEvent | IInterruptEvent, playerId: string) => {
    // Get the calculated Y position for this event using the same key logic
    const logLineId = getLogLineId(event);
    const eventKey = `${playerId}-${logLineId}`;
    const yPosition = globalTimeline.positionMap.get(eventKey) ?? 0;

    switch (event.type) {
      case 'aura':
        return (
          <AuraEvent
            event={event}
            eventKey={eventKey}
            yPosition={yPosition}
            spellIconSize={SPELL_ICON_SIZE}
            eventHorizontalPadding={EVENT_HORIZONTAL_PADDING}
          />
        );
      case 'interrupt':
        return (
          <InterruptEvent
            event={event}
            eventKey={eventKey}
            yPosition={yPosition}
            spellIconSize={SPELL_ICON_SIZE}
            eventHorizontalPadding={EVENT_HORIZONTAL_PADDING}
          />
        );
      case 'spellcast':
        return (
          <SpellCastEvent
            event={event}
            eventKey={eventKey}
            yPosition={yPosition}
            playerId={playerId}
            combat={combat}
            spellIconSize={SPELL_ICON_SIZE}
            eventHorizontalPadding={EVENT_HORIZONTAL_PADDING}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-row">
      {selectedPlayers.map((player, index) => {
        const events = globalTimeline.eventsByPlayer.get(player.id) || [];
        return (
          <div key={player.id} className="flex">
            {/* Player column */}
            <div className="flex flex-col">
              {/* Column header */}
              <div className="text-center" style={{ width: COLUMN_WIDTH, marginBottom: HEADER_BOTTOM_MARGIN }}>
                <div className="flex items-center justify-center mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6">
                      <SpecImage specId={player.spec} size={24} />
                    </div>
                    <span className="font-medium" style={{ color: getClassColor(player.class) }}>
                      {player.name.split('-')[0]}
                    </span>
                  </div>
                </div>
                <div className="text-xs opacity-75">{events.length} events</div>
              </div>

              {/* Timeline column */}
              <div className="relative" style={{ width: COLUMN_WIDTH, minHeight: totalHeight }}>
                {/* Events */}
                {events.map((event: ISpellCastTimelineEvent | IAuraEvent | IInterruptEvent) => {
                  const logLineId = getLogLineId(event);
                  const eventKey = `${player.id}-${logLineId}`;
                  return <div key={eventKey}>{renderEvent(event, player.id)}</div>;
                })}
              </div>
            </div>

            {/* Separator bar (except after the last column) */}
            {index < selectedPlayers.length - 1 && (
              <div
                className="flex flex-col items-center"
                style={{ marginLeft: COLUMN_SEPARATOR_MARGIN, marginRight: COLUMN_SEPARATOR_MARGIN }}
              >
                <div style={{ height: HEADER_BOTTOM_MARGIN + 32, marginBottom: HEADER_BOTTOM_MARGIN }}></div>
                {/* Spacer to align with headers */}
                <div className="w-px bg-base-300 flex-1" style={{ minHeight: totalHeight }}></div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
