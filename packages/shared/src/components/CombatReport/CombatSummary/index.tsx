import { CombatResult } from '@wowarenalogs/parser';
import _ from 'lodash';

import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';
import { CombatUnitTimelineView } from '../CombatUnitTimelineView';
import { Meters } from './Meters';
import { PlayerSummary } from './PlayerSummary';

export const CombatSummary = () => {
  const { combat, enemies, friends, players } = useCombatReportContext();
  if (!combat) {
    return null;
  }

  const allPlayerDeath = _.sortBy(
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

  return (
    <div className="flex flex-col">
      <div className="flex flex-row w-full items-center">
        <div
          className={`flex-grow rounded-box bg-base-300 flex flex-row px-4 py-2 border ${
            combat.result === CombatResult.Win && 'border-error'
          } ${combat.result === CombatResult.Lose && 'border-success'}`}
        >
          {enemies.map((u) => {
            return <PlayerSummary key={u.id} player={u} />;
          })}
        </div>
        <div className="divider divider-horizontal">V.S.</div>
        <div
          className={`flex-grow rounded-box bg-base-300 flex flex-row px-4 py-2 border ${
            combat.result === CombatResult.Lose && 'border-error'
          } ${combat.result === CombatResult.Win && 'border-success'}`}
        >
          {friends.map((u) => {
            return <PlayerSummary key={u.id} player={u} />;
          })}
        </div>
      </div>
      <div className="flex flex-row mt-4">
        <Meters />
        <div className="relative flex-1 ml-4">
          {allPlayerDeath.length ? (
            <table className="table table-compact w-full h-full">
              <thead>
                <tr>
                  <th className="bg-base-300">
                    <CombatUnitName unit={allPlayerDeath[0].unit} navigateToPlayerView />
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="bg-base-200">
                    <CombatUnitTimelineView
                      unit={allPlayerDeath[0].unit}
                      startTime={allPlayerDeath[0].deathRecord.timestamp - 20 * 1000}
                      endTime={allPlayerDeath[0].deathRecord.timestamp}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
};
