import { CombatResult } from '@wowarenalogs/parser';
import _ from 'lodash';

import { useCombatReportContext } from '../CombatReportContext';
import { Meters } from './Meters';
import { PlayerSummary } from './PlayerSummary';

export const CombatSummary = () => {
  const { combat, isAnonymized, enemies, friends, players } = useCombatReportContext();
  if (!combat) {
    return null;
  }

  const deadPlayers = players
    .filter((u) => u.deathRecords.length > 0)
    .sort((a, b) => a.deathRecords[0].timestamp - b.deathRecords[0].timestamp);

  return (
    <div className="flex flex-col">
      <div className="flex flex-row w-full items-center">
        <div className="flex-grow rounded-box bg-base-300 flex flex-row px-4 py-2">
          {enemies.map((u) => {
            return <PlayerSummary key={u.id} player={u} />;
          })}
        </div>
        {combat.result === CombatResult.Win && (
          <div className="ml-2 w-6 h-6 text-center rounded bg-error text-error-content">L</div>
        )}
        {combat.result === CombatResult.Lose && (
          <div className="ml-2 w-6 h-6 text-center rounded bg-success text-success-content">W</div>
        )}
        <div className="divider divider-horizontal">V.S.</div>
        {combat.result === CombatResult.Lose && (
          <div className="mr-2 w-6 h-6 text-center rounded bg-error text-error-content">L</div>
        )}
        {combat.result === CombatResult.Win && (
          <div className="mr-2 w-6 h-6 text-center rounded bg-success text-success-content">W</div>
        )}
        <div className="flex-grow rounded-box bg-base-300 flex flex-row px-4 py-2">
          {friends.map((u) => {
            return <PlayerSummary key={u.id} player={u} />;
          })}
        </div>
      </div>
      <div className="flex flex-row mt-4">
        <Meters />
      </div>
    </div>
  );
};
