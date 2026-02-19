import {
  CombatAction,
  CombatEvent,
  CombatExtraSpellAction,
  CombatHpUpdateAction,
  LogEvent,
  logLineToCombatEvent,
  stringToLogLine,
} from '@wowarenalogs/parser';
import moment from 'moment-timezone';
import { useContext, useMemo, useState } from 'react';
import { from } from 'rxjs';
import { filter } from 'rxjs/operators';

import { spellIdToPriority } from '../../../../data/spellTags';
import { SIGNIFICANT_DAMAGE_HEAL_THRESHOLD } from '../../../../utils/utils';
import { CombatReportContext } from '../../CombatReportContext';
import styles from './index.module.css';
import { ReplayEventDisplay } from './ReplayEventDisplay';
import { ReplayEventFilterByUnit } from './ReplayEventFilterByUnit';
import { ReplayEventFilterDropdown, ReplayEventFilters } from './ReplayEventFilterDropdown';

const MAX_EVENTS_TO_SHOW = 16;

interface IProps {
  currentTimeOffset: number;
  disableHighlight?: boolean;
  filterByUnitId: string | null;
  setUnitIdFilter: (unitId: string | null) => void;
}

function isCombatEvent(value: CombatEvent | string): value is CombatEvent {
  return typeof value !== 'string';
}

export const ReplayEvents = (props: IProps) => {
  const context = useContext(CombatReportContext);
  const [highlightEvent, setHighlightEvent] = useState<CombatEvent | null>(null);
  const [filters, setFilters] = useState<ReplayEventFilters>({
    significantAurasOnly: true,
    significantDamageHealOnly: true,
    gcdsOnly: false,
  });

  const qualifiedEvents = useMemo(() => {
    const MIN_DAMAGE_HEAL_NUMBER = context.combat?.wowVersion === 'retail' ? SIGNIFICANT_DAMAGE_HEAL_THRESHOLD : 300;

    const isWantedDamageOrHeal = (e: CombatEvent) =>
      e instanceof CombatHpUpdateAction &&
      (Math.abs(e.effectiveAmount) >= MIN_DAMAGE_HEAL_NUMBER || !filters.significantDamageHealOnly);
    const isExtraSpellAction = (e: CombatEvent) => e instanceof CombatExtraSpellAction;
    const isPlayerDeath = (e: CombatEvent) =>
      e instanceof CombatAction &&
      e.logLine.event === LogEvent.UNIT_DIED &&
      context.players.filter((p) => p.id === e.destUnitId).length;
    const isWantedAura = (e: CombatEvent) =>
      e instanceof CombatAction &&
      context.players.filter((p) => p.id === e.destUnitId).length &&
      (e.logLine.event === LogEvent.SPELL_AURA_APPLIED || e.logLine.event === LogEvent.SPELL_AURA_REMOVED) &&
      (spellIdToPriority.has(e.spellId || '0') || !filters.significantAurasOnly);
    const isAuraDose = (e: CombatEvent) =>
      e instanceof CombatAction &&
      (e.logLine.event === LogEvent.SPELL_AURA_APPLIED_DOSE || e.logLine.event === LogEvent.SPELL_AURA_REMOVED_DOSE) &&
      !filters.significantAurasOnly;
    const isWantedUnit = (e: CombatEvent) => {
      if (!props.filterByUnitId) {
        return true;
      }
      if (!(e instanceof CombatAction)) {
        return false;
      }
      return e.srcUnitId === props.filterByUnitId || e.destUnitId === props.filterByUnitId;
    };
    const wantedUnitIsCaster = (e: CombatEvent) => {
      if (!props.filterByUnitId) {
        return true;
      }
      if (!(e instanceof CombatAction)) {
        return false;
      }
      return e.srcUnitId === props.filterByUnitId;
    };
    const isGCDsModeEvent = (e: CombatEvent) => {
      return ['SPELL_CAST_SUCCESS', 'SPELL_DISPEL', 'SPELL_INTERRUPT', 'SPELL_STOLEN', 'UNIT_DIED'].includes(
        e.logLine.event,
      );
    };

    const items: CombatEvent[] = [];
    from(context.combat?.rawLines || [])
      .pipe(
        stringToLogLine(context.combat?.timezone || moment.tz.guess()),
        logLineToCombatEvent('retail'),
        filter(isCombatEvent),
      )
      .subscribe((e) => {
        if (filters.gcdsOnly) {
          if (wantedUnitIsCaster(e) && isGCDsModeEvent(e)) {
            items.push(e);
          }
        } else if (
          (isWantedDamageOrHeal(e) || isExtraSpellAction(e) || isPlayerDeath(e) || isWantedAura(e) || isAuraDose(e)) &&
          isWantedUnit(e)
        ) {
          items.push(e);
        }
      });

    return items;
  }, [context.combat, context.players, filters, props.filterByUnitId]);

  const eventsToShow = useMemo(() => {
    const results = qualifiedEvents.filter(
      (e) => e.timestamp - (context.combat?.startTime || 0) < props.currentTimeOffset,
    );
    return results.slice(Math.max(0, results.length - MAX_EVENTS_TO_SHOW));
  }, [qualifiedEvents, props.currentTimeOffset, context.combat]);

  const filterByUnit = (props.filterByUnitId ? context.combat?.units[props.filterByUnitId] : null) || null;

  return (
    <div className={`${styles['combat-report-replay-events-root']}`}>
      {props.disableHighlight ? null : (
        <div
          className={`${styles['combat-report-replay-highlight-event']} mr-2 ${
            highlightEvent ? 'visible' : 'invisible'
          }`}
        >
          {highlightEvent && <ReplayEventDisplay event={highlightEvent} expanded />}
        </div>
      )}
      <div className={`${styles['combat-report-replay-events']} flex flex-col bg-base-100 rounded`}>
        {eventsToShow.map((e) => {
          return (
            <div
              key={e.logLine.id}
              className={styles['combat-report-replay-event-mini-display']}
              onMouseOver={() => {
                setHighlightEvent(e);
              }}
            >
              <ReplayEventDisplay event={e} />
            </div>
          );
        })}
        <div className={`styles['combat-report-replay-events-filter-row'] m-2 flex flex-row justify-end`}>
          <ReplayEventFilterByUnit
            unit={filterByUnit}
            setFilter={props.setUnitIdFilter}
            placement={eventsToShow.length < 8 ? 'bottom' : 'top'}
          />
          <ReplayEventFilterDropdown
            filters={filters}
            setFilters={setFilters}
            placement={eventsToShow.length < 8 ? 'bottom' : 'top'}
          />
        </div>
      </div>
    </div>
  );
};
