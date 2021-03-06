import { useContext, useMemo, useState } from 'react';
import { from } from 'rxjs';
import { filter } from 'rxjs/operators';
import {
  CombatExtraSpellAction,
  CombatEvent,
  CombatHpUpdateAction,
  LogEvent,
  logLineToCombatEvent,
  stringToLogLine,
  CombatAction,
} from 'wow-combat-log-parser';

import styles from './index.module.css';

import { spellIdToPriority } from '../../../../../data/spellTags';
import { Box } from '../../../../common/Box';
import { CombatReportContext } from '../../CombatReportContext';
import { ReplayEventDisplay } from './ReplayEventDisplay';
import { ReplayEventFilterByUnit } from './ReplayEventFilterByUnit';
import { ReplayEventFilterDropdown, ReplayEventFilters } from './ReplayEventFilterDropdown';

const MAX_EVENTS_TO_SHOW = 16;

interface IProps {
  currentTimeOffset: number;
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
  });

  const qualifiedEvents = useMemo(() => {
    const MIN_DAMAGE_HEAL_NUMBER = context.combat?.wowVersion === 'shadowlands' ? 3000 : 300;

    const isWantedDamageOrHeal = (e: CombatEvent) =>
      e instanceof CombatHpUpdateAction &&
      (Math.abs(e.amount) >= MIN_DAMAGE_HEAL_NUMBER || !filters.significantDamageHealOnly);
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

    const items: CombatEvent[] = [];
    from(context.combat?.rawLines || [])
      .pipe(stringToLogLine(), logLineToCombatEvent(context.combat?.wowVersion || 'shadowlands'), filter(isCombatEvent))
      .subscribe((e) => {
        if (
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
    <Box className={styles['combat-report-replay-events-root']}>
      <Box
        className={styles['combat-report-replay-highlight-event']}
        style={{ visibility: highlightEvent ? 'visible' : 'hidden' }}
        mr={2}
      >
        {highlightEvent && <ReplayEventDisplay event={highlightEvent} expanded />}
      </Box>
      <Box className={styles['combat-report-replay-events']} display="flex" flexDirection="column">
        {eventsToShow.map((e) => {
          return (
            <Box
              key={e.logLine.id}
              className={styles['combat-report-replay-event-mini-display']}
              onMouseOver={() => {
                setHighlightEvent(e);
              }}
            >
              <ReplayEventDisplay event={e} />
            </Box>
          );
        })}
      </Box>
      <Box mt={1} className={styles['combat-report-replay-events-filter-row']} display="flex" flexDirection="row">
        <ReplayEventFilterByUnit unit={filterByUnit} setFilter={props.setUnitIdFilter} />
        <Box flex={1} />
        <ReplayEventFilterDropdown filters={filters} setFilters={setFilters} />
      </Box>
    </Box>
  );
};
