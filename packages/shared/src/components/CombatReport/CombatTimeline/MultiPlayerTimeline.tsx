import { getClassColor, ICombatUnit, ILogLine, LogEvent } from '@wowarenalogs/parser';
import _ from 'lodash';
import moment from 'moment';
import Image from 'next/image';
import { useMemo } from 'react';

import { Utils } from '../../../utils/utils';
import { SpecImage } from '../../common/SpecImage';
import { useCombatReportContext } from '../CombatReportContext';

interface ISpellCastTimelineEvent {
  spellId: string;
  spellName: string;
  timestamp: number;
  timeOffset: number;
  event: LogEvent;
  succeeded?: boolean;
  targetName?: string;
  targetId?: string;
  playerId: string;
  eventKey?: string;
  logLine?: ILogLine;
  deltaMs?: number; // Time since last spell cast for this player
}

interface IAuraEvent {
  type: 'aura';
  spellId: string;
  spellName: string;
  timestamp: number;
  timeOffset: number;
  event: 'applied' | 'removed';
  sourceUnit?: string;
  playerId: string;
  logLine: ILogLine;
  eventKey?: string;
}

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
}

export const MultiPlayerTimeline = ({ selectedPlayers, showSpells, showAuras }: IProps) => {
  const { combat } = useCombatReportContext();
  // Create a global chronological timeline with position assignments
  const globalTimeline = useMemo(() => {
    if (!combat) return { allEvents: [], eventsByPlayer: new Map(), positionMap: new Map() };

    // Collect all events from all players
    const allGlobalEvents: Array<(ISpellCastTimelineEvent | IAuraEvent) & { playerId: string }> = [];

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

    // Sort all events globally by timestamp
    const sortedGlobalEvents = _.sortBy(allGlobalEvents, 'timestamp');

    // Create position map using smart spacing algorithm
    const positionMap = new Map<string, number>(); // event key -> y position
    const eventsByPlayer = new Map<string, Array<ISpellCastTimelineEvent | IAuraEvent>>();

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

    // Track duplicate keys to log them
    const keyTracker = new Map<string, Array<(ISpellCastTimelineEvent | IAuraEvent) & { playerId: string }>>();

    sortedGlobalEvents.forEach((event, index) => {
      // Use the original log line ID as the event key for uniqueness
      const logLineId =
        'type' in event
          ? (event as IAuraEvent).logLine.id
          : (event as ISpellCastTimelineEvent).logLine?.id ||
            `fallback-${event.timestamp}-${event.spellId}-${event.event}-${index}`;
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

      // The event must be placed at least at the global minimum Y (for chronological order)
      // and at least at the column's low water mark (to avoid overlaps in the same column)
      // plus any extra time-based spacing
      const eventY = Math.max(globalMinY + extraTimeSpacing, columnMinY + extraTimeSpacing);

      // Update the low water mark for this column
      columnLowWaterMarks.set(playerId, eventY + EVENT_CARD_HEIGHT);

      // Update the global minimum Y for the next event
      globalMinY = eventY + CROSS_COLUMN_SPACING;

      // Update last event timestamp
      lastEventTimestamp = event.timestamp;

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
  }, [selectedPlayers, combat, showSpells, showAuras]);

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

  const renderEvent = (event: ISpellCastTimelineEvent | IAuraEvent, playerId: string) => {
    // Get the calculated Y position for this event using the same key logic
    const logLineId =
      'type' in event
        ? (event as IAuraEvent).logLine.id
        : (event as ISpellCastTimelineEvent).logLine?.id ||
          `fallback-${event.timestamp}-${event.spellId}-${event.event}`;
    const eventKey = `${playerId}-${logLineId}`;
    const yPosition = globalTimeline.positionMap.get(eventKey) ?? 0;

    if ('type' in event && event.type === 'aura') {
      const auraEvent = event as IAuraEvent;
      const isApplied = auraEvent.event === 'applied';

      return (
        <div
          key={eventKey}
          className="absolute flex items-center z-10"
          style={{ top: yPosition, left: EVENT_HORIZONTAL_PADDING, right: EVENT_HORIZONTAL_PADDING }}
        >
          <div
            className={`relative flex items-center p-1 rounded w-full ${
              isApplied ? 'bg-info bg-opacity-20 border border-info' : 'bg-neutral bg-opacity-20 border border-neutral'
            }`}
            title={`${auraEvent.spellName} ${isApplied ? 'aura gained' : 'aura removed'} at ${moment
              .utc(auraEvent.timeOffset)
              .format('mm:ss.SSS')}${auraEvent.sourceUnit ? ` from ${auraEvent.sourceUnit}` : ''}`}
          >
            <div className="w-6 h-6 mr-2 relative">
              <Image
                className="rounded"
                src={Utils.getSpellIcon(auraEvent.spellId) ?? 'https://images.wowarenalogs.com/spells/0.jpg'}
                width={SPELL_ICON_SIZE}
                height={SPELL_ICON_SIZE}
                alt={auraEvent.spellName}
              />
              <div
                className={`absolute -top-1 -right-1 w-3 h-3 rounded-full text-xs flex items-center justify-center ${
                  isApplied ? 'bg-success text-success-content' : 'bg-error text-error-content'
                }`}
              >
                {isApplied ? '+' : '−'}
              </div>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{auraEvent.spellName}</div>
              <div className="text-xs opacity-75">
                {isApplied ? 'Aura Gained' : 'Aura Removed'} •{moment.utc(auraEvent.timeOffset).format('mm:ss.SSS')}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Spell event
    const spellEvent = event as ISpellCastTimelineEvent;
    const isSuccess = spellEvent.event === LogEvent.SPELL_CAST_SUCCESS;

    return (
      <div
        key={eventKey}
        className="absolute flex items-center z-10"
        style={{ top: yPosition, left: EVENT_HORIZONTAL_PADDING, right: EVENT_HORIZONTAL_PADDING }}
      >
        <div
          className={`relative flex items-center p-1 rounded w-full ${
            isSuccess
              ? 'bg-success bg-opacity-20 border border-success'
              : 'bg-warning bg-opacity-20 border border-warning'
          }`}
          title={`${spellEvent.spellName} - ${spellEvent.event} at ${moment
            .utc(spellEvent.timeOffset)
            .format('mm:ss.SSS')}${spellEvent.targetName ? ` → ${spellEvent.targetName}` : ''}`}
        >
          <div className="w-6 h-6 mr-2">
            <Image
              className="rounded"
              src={Utils.getSpellIcon(spellEvent.spellId) ?? 'https://images.wowarenalogs.com/spells/0.jpg'}
              width={SPELL_ICON_SIZE}
              height={SPELL_ICON_SIZE}
              alt={spellEvent.spellName}
            />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{spellEvent.spellName}</div>
            <div className="text-xs opacity-75">
              {isSuccess ? 'Cast' : 'Started'} •{moment.utc(spellEvent.timeOffset).format('mm:ss.SSS')}
              {spellEvent.deltaMs !== undefined &&
                ` • Δ${
                  spellEvent.deltaMs === 0
                    ? '0s'
                    : spellEvent.deltaMs < 1000
                    ? `${spellEvent.deltaMs}ms`
                    : `${(spellEvent.deltaMs / 1000).toFixed(1)}s`
                }`}
            </div>
          </div>
          {spellEvent.targetId &&
            spellEvent.targetId !== '0000000000000000' &&
            spellEvent.targetId !== '0' &&
            combat?.units[spellEvent.targetId] &&
            spellEvent.targetId !== playerId && (
              <div className="flex items-center ml-2">
                <span className="text-xs opacity-60 mr-1">→</span>
                <SpecImage specId={combat.units[spellEvent.targetId].spec} size={16} />
              </div>
            )}
        </div>
      </div>
    );
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
                {events.map((event: ISpellCastTimelineEvent | IAuraEvent) => renderEvent(event, player.id))}
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
