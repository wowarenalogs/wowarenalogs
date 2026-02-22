import { CombatAbsorbAction, CombatHpUpdateAction } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useEffect, useMemo, useState } from 'react';

import { Utils } from '../../../utils/utils';
import { CHART_TIME_INTERVAL_S, getDataPoint } from '../CombatCurves/constants';
import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';
import { SpellIcon } from '../SpellIcon';
import { StackedDamageChart } from './StackedDamageChart';

const SERIES_COLORS = [
  '#38bdf8',
  '#f87171',
  '#facc15',
  '#34d399',
  '#a78bfa',
  '#fb923c',
  '#2dd4bf',
  '#f472b6',
  '#94a3b8',
];

interface ISpellStat {
  id: string;
  name: string;
  total: number;
  hits: number;
  crits: number;
}

const isHpUpdateAction = (action: CombatHpUpdateAction | CombatAbsorbAction): action is CombatHpUpdateAction => {
  return 'isCritical' in action;
};

const compileSpellStats = (actions: CombatHpUpdateAction[]) => {
  const spellMap = new Map<string, ISpellStat>();
  actions
    .filter((a) => a.effectiveAmount !== 0)
    .forEach((action) => {
      const id = action.spellId ? String(action.spellId) : 'swing';
      const name = action.spellName || 'Auto Attack';
      const entry = spellMap.get(id) || { id, name, total: 0, hits: 0, crits: 0 };
      entry.total += Math.abs(action.effectiveAmount);
      entry.hits += 1;
      if (action.isCritical) {
        entry.crits += 1;
      }
      spellMap.set(id, entry);
    });
  return Array.from(spellMap.values()).sort((a, b) => b.total - a.total);
};

export const CombatPerformance = () => {
  const { combat, players, activePlayerId } = useCombatReportContext();
  const [activeMode, setActiveMode] = useState<'damage' | 'taken' | 'healing'>('damage');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string>('all');
  const [selectedSpellId, setSelectedSpellId] = useState<string>('all');

  useEffect(() => {
    if (!players.length) {
      return;
    }
    const isSelectedValid = selectedPlayerId && players.some((player) => player.id === selectedPlayerId);
    if (!isSelectedValid) {
      setSelectedPlayerId(activePlayerId ?? players[0].id);
    }
  }, [activePlayerId, players, selectedPlayerId]);

  useEffect(() => {
    setSelectedTargetId('all');
    setSelectedSpellId('all');
  }, [selectedPlayerId, activeMode]);

  const activePlayer = useMemo(() => {
    return players.find((p) => p.id === selectedPlayerId) ?? players[0];
  }, [players, selectedPlayerId]);

  const spellCastCounts = useMemo(() => {
    if (!activePlayer) return new Map<string, number>();
    const castEvents = activePlayer.spellCastEvents.filter((e) => e.logLine.event === 'SPELL_CAST_SUCCESS');
    const groups = _.groupBy(castEvents, (e) => e.spellId || 'swing');
    return new Map(Object.entries(groups).map(([key, value]) => [key, value.length]));
  }, [activePlayer]);

  const actionsForMode = useMemo(() => {
    if (!activePlayer) return [];
    const rawActions =
      activeMode === 'damage'
        ? activePlayer.damageOut
        : activeMode === 'taken'
          ? activePlayer.damageIn
          : activePlayer.healOut;
    return rawActions.filter(isHpUpdateAction);
  }, [activePlayer, activeMode]);

  const filteredActions = useMemo(() => {
    if (!combat) return [];
    return actionsForMode.filter((action) => {
      if (selectedSpellId !== 'all' && String(action.spellId || 'swing') !== selectedSpellId) {
        return false;
      }
      if (selectedTargetId === 'all') {
        return true;
      }
      const targetId = activeMode === 'damage' || activeMode === 'healing' ? action.destUnitId : action.srcUnitId;
      return targetId === selectedTargetId;
    });
  }, [actionsForMode, combat, activeMode, selectedSpellId, selectedTargetId]);

  const spellStats = useMemo(() => {
    if (!activePlayer) return [];
    return compileSpellStats(filteredActions);
  }, [activePlayer, filteredActions]);

  const topSpellStats = spellStats.slice(0, 8);
  const otherSpellStats = spellStats.slice(8);

  const chartData = useMemo<({ timeMark: number } & Record<string, number>)[]>(() => {
    if (!combat || !activePlayer) return [];

    const eventsBySpell = new Map<string, CombatHpUpdateAction[]>();
    filteredActions
      .filter((a) => a.effectiveAmount !== 0)
      .forEach((action) => {
        const key = action.spellId ? String(action.spellId) : 'swing';
        if (!eventsBySpell.has(key)) {
          eventsBySpell.set(key, []);
        }
        eventsBySpell.get(key)?.push(action);
      });

    const activeTopSpells = selectedSpellId === 'all' ? topSpellStats : spellStats.slice(0, 1);
    const topSpellIds = new Set(activeTopSpells.map((s) => s.id));
    const otherEvents: CombatHpUpdateAction[] = [];
    if (selectedSpellId === 'all') {
      eventsBySpell.forEach((events, key) => {
        if (!topSpellIds.has(key)) {
          otherEvents.push(...events);
        }
      });
    }

    return _.range(
      0,
      Math.ceil((combat.endTime - combat.startTime) / 1000) + CHART_TIME_INTERVAL_S,
      CHART_TIME_INTERVAL_S,
    ).map((timeMark) => {
      const row: { timeMark: number } & Record<string, number> = { timeMark };
      activeTopSpells.forEach((spell) => {
        row[spell.id] = getDataPoint(timeMark, combat.startTime, eventsBySpell.get(spell.id) || []);
      });
      if (selectedSpellId === 'all' && otherEvents.length) {
        row.other = getDataPoint(timeMark, combat.startTime, otherEvents);
      }
      return row;
    });
  }, [combat, activePlayer, filteredActions, spellStats, topSpellStats, selectedSpellId]);

  const chartSeries = useMemo(() => {
    const seriesBase = selectedSpellId === 'all' ? topSpellStats : spellStats.slice(0, 1);
    const series = seriesBase.map((spell, index) => ({
      key: spell.id,
      name: spell.name,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
    }));
    if (selectedSpellId === 'all' && otherSpellStats.length) {
      series.push({
        key: 'other',
        name: 'Other',
        color: '#64748b',
      });
    }
    return series;
  }, [topSpellStats, otherSpellStats.length, selectedSpellId, spellStats]);

  const availableTargets = useMemo(() => {
    if (!combat || !activePlayer) return [];
    const ids = new Set<string>();
    actionsForMode.forEach((action) => {
      const id = activeMode === 'damage' || activeMode === 'healing' ? action.destUnitId : action.srcUnitId;
      if (id && combat.units[id]) {
        ids.add(id);
      }
    });
    return Array.from(ids).map((id) => combat.units[id]);
  }, [actionsForMode, activeMode, combat, activePlayer]);

  const availableSpells = useMemo(() => {
    const spellMap = new Map<string, string>();
    actionsForMode.forEach((action) => {
      const id = action.spellId ? String(action.spellId) : 'swing';
      const name = action.spellName || 'Auto Attack';
      if (!spellMap.has(id)) {
        spellMap.set(id, name);
      }
    });
    return Array.from(spellMap.entries()).map(([id, name]) => ({ id, name }));
  }, [actionsForMode]);

  if (!combat || !activePlayer) {
    return null;
  }

  const combatDuration = Math.max((combat.endTime - combat.startTime) / 1000, 1);
  const totalOutput = spellStats.reduce((sum, spell) => sum + spell.total, 0);
  const totalLabel =
    activeMode === 'damage' ? 'Total Damage' : activeMode === 'taken' ? 'Damage Taken' : 'Total Healing';
  const rateLabel = activeMode === 'healing' ? 'HPS' : 'DPS';
  const chartLabel =
    activeMode === 'damage'
      ? 'Damage Done (per second)'
      : activeMode === 'taken'
        ? 'Damage Taken (per second)'
        : 'Healing Done (per second)';

  return (
    <div className="flex flex-row flex-1">
      <div className="flex flex-col">
        <ul className="menu mr-2 min-w-fit sticky top-0">
          {players.map((u) => (
            <li key={u.id} className={`${activePlayer?.id === u.id ? 'bordered' : ''}`}>
              <a
                className="flex flex-row"
                onClick={() => {
                  setSelectedPlayerId(u.id);
                }}
              >
                <CombatUnitName unit={u} />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col flex-1 ml-4">
        <div className="flex flex-row items-center gap-2">
          <div>
            <div className="text-2xl font-bold flex items-center gap-2">
              <CombatUnitName unit={activePlayer} noEllipsis />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="stats shadow bg-base-300">
              <div className="stat py-1 px-4">
                <div className="stat-title">{totalLabel}</div>
                <div className="stat-value text-error text-xl">{Utils.printCombatNumber(totalOutput)}</div>
              </div>
              <div className="stat py-1 px-4">
                <div className="stat-title">{rateLabel}</div>
                <div className="stat-value text-xl">{Utils.printCombatNumber(totalOutput / combatDuration)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="tabs tabs-boxed">
            <a className={`tab ${activeMode === 'damage' ? 'tab-active' : ''}`} onClick={() => setActiveMode('damage')}>
              Damage Done
            </a>
            <a className={`tab ${activeMode === 'taken' ? 'tab-active' : ''}`} onClick={() => setActiveMode('taken')}>
              Damage Taken
            </a>
            <a
              className={`tab ${activeMode === 'healing' ? 'tab-active' : ''}`}
              onClick={() => setActiveMode('healing')}
            >
              Healing
            </a>
          </div>
          <select
            className="select select-bordered select-sm"
            value={selectedTargetId}
            onChange={(event) => setSelectedTargetId(event.target.value)}
          >
            <option value="all">All Targets</option>
            {availableTargets.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name.split('-')[0]}
              </option>
            ))}
          </select>
          <select
            className="select select-bordered select-sm"
            value={selectedSpellId}
            onChange={(event) => setSelectedSpellId(event.target.value)}
          >
            <option value="all">All Abilities</option>
            {availableSpells.map((spell) => (
              <option key={spell.id} value={spell.id}>
                {spell.name}
              </option>
            ))}
          </select>
          <div className="ml-auto text-xs opacity-70">Interval: {CHART_TIME_INTERVAL_S}s</div>
        </div>

        <div className="mt-3 rounded-box border border-base-300 bg-base-200 p-3">
          <div className="text-sm font-semibold mb-2 text-error">{chartLabel}</div>
          <div className="h-64">
            <StackedDamageChart data={chartData} series={chartSeries} />
          </div>
        </div>

        <div className="mt-4 rounded-box border border-base-300 bg-base-200">
          <table className="table table-compact w-full">
            <thead>
              <tr>
                <th className="bg-base-300">Ability</th>
                <th className="bg-base-300 text-right">Amount</th>
                <th className="bg-base-300 text-right">Casts</th>
                <th className="bg-base-300 text-right">Hits</th>
                <th className="bg-base-300 text-right">Avg Hit</th>
                <th className="bg-base-300 text-right">Crit %</th>
                <th className="bg-base-300 text-right">{rateLabel}</th>
              </tr>
            </thead>
            <tbody>
              {spellStats.map((spell) => {
                const casts = spellCastCounts.get(spell.id) ?? 0;
                const critRate = spell.hits ? (100 * spell.crits) / spell.hits : 0;
                return (
                  <tr key={spell.id}>
                    <td className="bg-base-200 flex flex-row items-center">
                      <SpellIcon spellId={spell.id} size={20} />
                      <div className="ml-2">{spell.name}</div>
                    </td>
                    <td className="bg-base-200 text-right">{Utils.printCombatNumber(spell.total)}</td>
                    <td className="bg-base-200 text-right">{casts || '-'}</td>
                    <td className="bg-base-200 text-right">{spell.hits}</td>
                    <td className="bg-base-200 text-right">
                      {Utils.printCombatNumber(spell.hits ? spell.total / spell.hits : 0)}
                    </td>
                    <td className="bg-base-200 text-right">{critRate.toFixed(1)}%</td>
                    <td className="bg-base-200 text-right">{Utils.printCombatNumber(spell.total / combatDuration)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
