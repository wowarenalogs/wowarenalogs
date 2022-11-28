import { CombatUnitType } from '@wowarenalogs/parser';
import _ from 'lodash';

import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';
import { CombatPlayer } from './CombatPlayer';

export const CombatPlayers = () => {
  const { combat, activePlayerId, navigateToPlayerView } = useCombatReportContext();

  if (!combat) {
    return null;
  }

  const players = _.sortBy(
    _.values(combat.units).filter((u) => u.type === CombatUnitType.Player),
    ['reaction', 'name'],
  );

  return (
    <div className="flex flex-row flex-1">
      <ul className="menu mr-2 min-w-fit">
        {players.map((u) => (
          <li key={u.id} className={`${activePlayerId === u.id ? 'bordered' : ''}`}>
            <a
              className="flex flex-row"
              onClick={() => {
                navigateToPlayerView(u.id);
              }}
            >
              <CombatUnitName unit={u} />
            </a>
          </li>
        ))}
      </ul>
      {players.map((u) => activePlayerId === u.id && <CombatPlayer key={u.id} player={u} />)}
    </div>
  );
};
