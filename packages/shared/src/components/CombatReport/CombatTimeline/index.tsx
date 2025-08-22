import { LogEvent } from '@wowarenalogs/parser';
import _ from 'lodash';
import moment from 'moment';
import Image from 'next/image';
import { useMemo, useState } from 'react';

import { Utils } from '../../../utils/utils';
import { SpecImage } from '../../common/SpecImage';
import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';

interface ISpellCastTimelineEvent {
  spellId: string;
  spellName: string;
  timestamp: number;
  timeOffset: number;
  event: LogEvent;
  succeeded?: boolean;
  targetName?: string;
  targetId?: string;
}

interface IIdleEvent {
  type: 'idle';
  duration: number; // Duration in seconds
  timestamp: number;
}

interface IAuraEvent {
  type: 'aura';
  spellId: string;
  spellName: string;
  timestamp: number;
  timeOffset: number;
  event: 'applied' | 'removed';
  sourceUnit?: string;
}

const SPELL_EVENT_HEIGHT = 50; // Fixed height per spell event
const SPELL_ICON_SIZE = 24;
const IDLE_THRESHOLD_MS = 3000; // 3 seconds

export const CombatTimeline = () => {
  const { combat, players } = useCombatReportContext();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(players.length > 0 ? players[0].id : null);
  const [showAuras, setShowAuras] = useState<boolean>(false);
  const [showSpells, setShowSpells] = useState<boolean>(true);

  const selectedPlayer = useMemo(() => {
    return players.find((p) => p.id === selectedPlayerId) || null;
  }, [players, selectedPlayerId]);

  const spellCastEvents = useMemo(() => {
    if (!selectedPlayer || !combat) {
      return [];
    }

    const events: ISpellCastTimelineEvent[] = [];

    selectedPlayer.spellCastEvents.forEach((event) => {
      if (event.spellId && event.spellName) {
        console.log('Raw spell cast event:', {
          spellName: event.spellName,
          spellId: event.spellId,
          destUnitName: event.destUnitName,
          destUnitId: event.destUnitId,
          srcUnitName: event.srcUnitName,
          srcUnitId: event.srcUnitId,
          logLineRaw: event.logLine.raw,
          logLineEvent: event.logLine.event,
          logLineParameters: event.logLine.parameters,
        });

        events.push({
          spellId: event.spellId,
          spellName: event.spellName,
          timestamp: event.timestamp,
          timeOffset: event.timestamp - combat.startTime,
          event: event.logLine.event as LogEvent,
          succeeded: event.logLine.event === LogEvent.SPELL_CAST_SUCCESS,
          targetName: event.destUnitName,
          targetId: event.destUnitId,
        });
      }
    });

    return _.sortBy(events, 'timestamp');
  }, [selectedPlayer, combat]);

  const auraEvents = useMemo(() => {
    if (!selectedPlayer || !combat) {
      return [];
    }

    const events: IAuraEvent[] = [];

    selectedPlayer.auraEvents.forEach((event) => {
      if (event.spellId && event.spellName) {
        const isApplied =
          event.logLine.event === 'SPELL_AURA_APPLIED' || event.logLine.event === 'SPELL_AURA_APPLIED_DOSE';
        const isRemoved =
          event.logLine.event === 'SPELL_AURA_REMOVED' || event.logLine.event === 'SPELL_AURA_REMOVED_DOSE';

        if (isApplied || isRemoved) {
          events.push({
            type: 'aura',
            spellId: event.spellId,
            spellName: event.spellName,
            timestamp: event.timestamp,
            timeOffset: event.timestamp - combat.startTime,
            event: isApplied ? 'applied' : 'removed',
            sourceUnit: event.srcUnitName,
          });
        }
      }
    });

    return _.sortBy(events, 'timestamp');
  }, [selectedPlayer, combat]);

  // Create combined events list with idle periods
  const combinedEvents = useMemo(() => {
    // Combine spell events and aura events (if enabled)
    const allActiveEvents: Array<ISpellCastTimelineEvent | IAuraEvent> = [
      ...(showSpells ? spellCastEvents : []),
      ...(showAuras ? auraEvents : []),
    ];

    // Sort all events by timestamp
    const sortedEvents = _.sortBy(allActiveEvents, 'timestamp');

    const events: Array<ISpellCastTimelineEvent | IAuraEvent | IIdleEvent> = [];

    for (let i = 0; i < sortedEvents.length; i++) {
      const currentEvent = sortedEvents[i];
      const nextEvent = sortedEvents[i + 1];

      // Add the current event
      events.push(currentEvent);

      // Check if there's a significant gap to the next event (only between spell events for idle detection)
      if (nextEvent && !('type' in currentEvent) && !('type' in nextEvent)) {
        const timeBetween = nextEvent.timestamp - currentEvent.timestamp;
        if (timeBetween > IDLE_THRESHOLD_MS) {
          events.push({
            type: 'idle',
            duration: timeBetween / 1000, // Convert to seconds
            timestamp: currentEvent.timestamp + timeBetween / 2, // Midpoint timestamp
          });
        }
      }
    }

    return events;
  }, [spellCastEvents, auraEvents, showAuras, showSpells]);

  // Position events sequentially with even spacing
  const eventPositions = useMemo(() => {
    return combinedEvents.map((event, index) => ({
      event,
      position: index * SPELL_EVENT_HEIGHT,
    }));
  }, [combinedEvents]);

  const combatDurationInSeconds = combat ? (combat.endTime - combat.startTime) / 1000 : 0;

  // Calculate total height needed for all events
  const totalHeight = useMemo(() => {
    return Math.max(combinedEvents.length * SPELL_EVENT_HEIGHT, 200); // Minimum height of 200px
  }, [combinedEvents.length]);

  if (!combat) {
    return null;
  }

  return (
    <div className="flex flex-row flex-1">
      <div className="flex flex-col">
        <div className="mb-4">
          <div className="form-control">
            <label className="label cursor-pointer">
              <span className="label-text mr-2">Show Spells</span>
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={showSpells}
                onChange={(e) => setShowSpells(e.target.checked)}
              />
            </label>
          </div>
          <div className="form-control">
            <label className="label cursor-pointer">
              <span className="label-text mr-2">Show Auras</span>
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={showAuras}
                onChange={(e) => setShowAuras(e.target.checked)}
              />
            </label>
          </div>
        </div>
        <ul className="menu mr-2 min-w-fit sticky top-0">
          {players.map((player) => (
            <li key={player.id} className={`${selectedPlayerId === player.id ? 'bordered' : ''}`}>
              <a
                className="flex flex-row"
                onClick={() => {
                  setSelectedPlayerId(player.id);
                }}
              >
                <CombatUnitName unit={player} />
              </a>
            </li>
          ))}
        </ul>
      </div>

      {selectedPlayer && (
        <div className="flex-1 ml-4">
          <div className="mb-4">
            <h3 className="text-lg font-bold">
              Spell Sequence for <CombatUnitName unit={selectedPlayer} />
            </h3>
            <p className="text-sm opacity-75">
              {showSpells ? spellCastEvents.length : 0} spell events • {showAuras ? auraEvents.length : 0} aura events •{' '}
              {combinedEvents.filter((e) => 'type' in e && e.type === 'idle').length} idle periods • Combat duration:{' '}
              {moment.utc(combatDurationInSeconds * 1000).format('mm:ss')}
            </p>
          </div>

          <div className="relative" style={{ minHeight: totalHeight, maxWidth: '256px' }}>
            {/* Timeline background */}
            <div
              className="w-1 bg-base-300 absolute left-8"
              style={{
                height: totalHeight,
              }}
            />

            {/* Events (spells, auras, and idle periods) */}
            {eventPositions.map(({ event, position }, index) => {
              // Type guards for different event types
              const isIdleEvent = 'type' in event && event.type === 'idle';
              const isAuraEvent = 'type' in event && event.type === 'aura';

              if (isIdleEvent) {
                return (
                  <div
                    key={`idle-${event.timestamp}-${index}`}
                    className="absolute flex items-center"
                    style={{
                      top: position,
                      left: 40,
                      right: 20,
                    }}
                  >
                    <div className="relative flex items-center p-2 rounded bg-base-200 border border-base-300 opacity-60 w-full">
                      <div className="w-6 h-6 mr-2 flex items-center justify-center bg-base-300 rounded text-xs">
                        ⏸
                      </div>
                      <div className="flex flex-col">
                        <div className="text-sm font-medium">{event.duration.toFixed(1)}s idle</div>
                        <div className="text-xs opacity-75">No spell activity</div>
                      </div>
                    </div>
                  </div>
                );
              } else if (isAuraEvent) {
                // It's an aura event
                const auraEvent = event as IAuraEvent;
                const isApplied = auraEvent.event === 'applied';

                return (
                  <div
                    key={`aura-${auraEvent.spellId}-${auraEvent.timestamp}-${index}`}
                    className="absolute flex items-center"
                    style={{
                      top: position,
                      left: 40,
                      right: 20,
                    }}
                  >
                    <div
                      className={`relative flex items-center p-1 rounded w-full ${
                        isApplied
                          ? 'bg-info bg-opacity-20 border border-info'
                          : 'bg-neutral bg-opacity-20 border border-neutral'
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
                        {/* Overlay indicator for aura type */}
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
                          {isApplied ? 'Aura Gained' : 'Aura Removed'} •
                          {moment.utc(auraEvent.timeOffset).format('mm:ss.SSS')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              } else {
                // It's a spell event
                const spellEvent = event as ISpellCastTimelineEvent;
                const isSuccess = spellEvent.event === LogEvent.SPELL_CAST_SUCCESS;
                const isFailed = spellEvent.event === LogEvent.SPELL_CAST_FAILED;

                // Debug targeting logic
                const hasTargetId = !!spellEvent.targetId;
                const isNotNullTarget = spellEvent.targetId !== '0000000000000000' && spellEvent.targetId !== '0';
                const targetExistsInCombat = !!combat?.units[spellEvent.targetId || ''];
                const isNotSelfTarget = spellEvent.targetId !== selectedPlayer?.id;
                const shouldShowTarget = hasTargetId && isNotNullTarget && targetExistsInCombat && isNotSelfTarget;

                if (spellEvent.spellName === 'Cyclone') {
                  console.log('Cyclone targeting debug:', {
                    spellEvent,
                    hasTargetId,
                    isNotNullTarget,
                    targetExistsInCombat,
                    isNotSelfTarget,
                    shouldShowTarget,
                    selectedPlayerId: selectedPlayer?.id,
                    targetUnit: combat?.units[spellEvent.targetId || ''],
                  });
                }

                return (
                  <div
                    key={`${spellEvent.spellId}-${spellEvent.timestamp}-${index}`}
                    className="absolute flex items-center"
                    style={{
                      top: position,
                      left: 40,
                      right: 20,
                    }}
                  >
                    <div
                      className={`relative flex items-center p-1 rounded w-full ${
                        isSuccess
                          ? 'bg-success bg-opacity-20 border border-success'
                          : isFailed
                          ? 'bg-error bg-opacity-20 border border-error'
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
                          {isSuccess ? 'Cast' : isFailed ? 'Failed' : 'Started'} •
                          {moment.utc(spellEvent.timeOffset).format('mm:ss.SSS')}
                        </div>
                      </div>
                      {spellEvent.targetId &&
                        spellEvent.targetId !== '0000000000000000' &&
                        spellEvent.targetId !== '0' &&
                        combat?.units[spellEvent.targetId] &&
                        spellEvent.targetId !== selectedPlayer?.id && (
                          <div className="flex items-center ml-2">
                            <span className="text-xs opacity-60 mr-1">→</span>
                            <SpecImage specId={combat.units[spellEvent.targetId].spec} size={16} />
                          </div>
                        )}
                    </div>
                  </div>
                );
              }
            })}
          </div>

          {spellCastEvents.length === 0 && (
            <div className="text-center py-8 opacity-60">No spell cast events recorded for this player</div>
          )}
        </div>
      )}
    </div>
  );
};
