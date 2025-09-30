import { ICombatUnit, ILogLine } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useEffect, useMemo, useState } from 'react';

import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';
import { CombatUnitTimelineView } from '../CombatUnitTimelineView';

interface IPlayerDeath {
  unit: ICombatUnit;
  deathRecord: ILogLine;
}

function getDeathID(death: IPlayerDeath | null) {
  if (death === null) {
    return '';
  }
  return `${death.unit.id}_${death.deathRecord.timestamp.toFixed()}`;
}

export function CombatDeathReports() {
  const { combat, players } = useCombatReportContext();
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [onlyShowCC, setOnlyShowCC] = useState(false);
  const allPlayerDeath = useMemo(() => {
    return _.sortBy(
      _.flatMap(players, (p) => {
        return p.deathRecords.map((r) => {
          return {
            unit: p,
            deathRecord: r,
          };
        });
      }),
      (r) => r.deathRecord.timestamp,
    );
  }, [players]);

  const sortedPlayers = useMemo(() => {
    return _.sortBy(players, [
      // Sort by death count (descending) - players with deaths first
      (p) => -p.deathRecords.length,
      // Then by name for consistent ordering
      (p) => p.name,
    ]);
  }, [players]);

  useEffect(() => {
    if (activePlayerId === null && sortedPlayers.length > 0) {
      // Prefer players who died, otherwise take the first player
      const playersWithDeaths = sortedPlayers.filter((p) => p.deathRecords.length > 0);
      setActivePlayerId(playersWithDeaths.length > 0 ? playersWithDeaths[0].id : sortedPlayers[0].id);
    }
  }, [activePlayerId, sortedPlayers]);

  if (!combat) {
    return null;
  }

  const activePlayer = sortedPlayers.find((p) => p.id === activePlayerId);
  const activePlayerDeaths = activePlayer ? allPlayerDeath.filter((d) => d.unit.id === activePlayer.id) : [];

  return (
    <div className="flex flex-row flex-1">
      <ul className="menu mr-2 min-w-fit sticky top-0">
        {sortedPlayers.map((player) => {
          const playerDeaths = allPlayerDeath.filter((d) => d.unit.id === player.id);
          const deathCount = playerDeaths.length;
          return (
            <li key={player.id} className={`${activePlayerId === player.id ? 'bordered' : ''}`}>
              <a
                className="flex flex-col items-start"
                onClick={() => {
                  setActivePlayerId(player.id);
                }}
              >
                <CombatUnitName unit={player} />
                {deathCount > 0 && <div className="opacity-60 text-xs">Died</div>}
              </a>
            </li>
          );
        })}
        <div className="divider" />
        <label className="label gap-2 justify-start items-center">
          <input
            type="checkbox"
            checked={onlyShowCC}
            onChange={(v) => setOnlyShowCC(v.target.checked)}
            className="checkbox checkbox-sm"
          />
          <span className="label-text text-left">Only Show CC</span>
        </label>
      </ul>
      {activePlayer && (
        <div className="flex-1 relative bg-base-300 rounded-box p-4">
          {activePlayerDeaths.length > 0 ? (
            // Show death timeline if player has deaths
            <div className="space-y-4">
              {activePlayerDeaths.map((death) => {
                const deathID = getDeathID(death);
                return (
                  <div key={deathID} className="border-b border-gray-600 pb-4 last:border-b-0">
                    <CombatUnitTimelineView
                      unit={death.unit}
                      startTime={death.deathRecord.timestamp - 29 * 1000}
                      endTime={death.deathRecord.timestamp}
                      onlyShowCC={onlyShowCC}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            // Show timeline with 30s sliding window if player has no deaths
            <div>
              <CombatUnitTimelineView
                unit={activePlayer}
                startTime={combat.endTime - 29000} // Last 30 seconds
                endTime={combat.endTime}
                onlyShowCC={onlyShowCC}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
