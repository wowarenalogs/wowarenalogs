import { CombatResult, CombatUnitReaction, CombatUnitType } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useEffect, useState } from 'react';

import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';
import { PlayerCurves } from './PlayerCurves';
import { TeamCurves } from './TeamCurves';

export const CombatCurves = () => {
  const { combat, isAnonymized } = useCombatReportContext();
  const [activeTabID, setActiveTabID] = useState<string | null>(null);

  useEffect(() => {
    setActiveTabID('ttab-1');
  }, [combat]);

  if (!combat) {
    return null;
  }

  const players = _.sortBy(
    _.values(combat.units).filter((u) => u.type === CombatUnitType.Player),
    ['reaction', 'name'],
  );

  const enemies = players.filter((p) => p.reaction === CombatUnitReaction.Hostile);
  const friends = players.filter((p) => p.reaction === CombatUnitReaction.Friendly);

  return (
    <div className="flex flex-row flex-1">
      <ul className="menu mr-2 min-w-fit">
        <li key="ttab-1" className={`${activeTabID === 'ttab-1' ? 'bordered' : ''}`}>
          <a
            className="flex flex-row"
            onClick={() => {
              setActiveTabID('ttab-1');
            }}
          >
            <div>{isAnonymized ? 'Team 1' : 'Enemy Team'}</div>
            {combat.result === CombatResult.Lose && (
              <div className="ml-2 badge badge-success">{CombatResult[CombatResult.Win]}</div>
            )}
          </a>
        </li>
        {friends.map((u) => (
          <li key={u.id} className={`${activeTabID === u.id ? 'bordered' : ''}`}>
            <a
              className="flex flex-row"
              onClick={() => {
                setActiveTabID(u.id);
              }}
            >
              <CombatUnitName unit={u} />
            </a>
          </li>
        ))}
        <li key="ttab-2" className={`${activeTabID === 'ttab-2' ? 'bordered' : ''}`}>
          <a
            className="flex flex-row"
            onClick={() => {
              setActiveTabID('ttab-2');
            }}
          >
            <div>{isAnonymized ? 'Team 2' : 'My Team'}</div>
            {combat.result === CombatResult.Win && (
              <div className="ml-2 badge badge-success">{CombatResult[CombatResult.Win]}</div>
            )}
          </a>
        </li>
        {enemies.map((u) => (
          <li key={u.id} className={`${activeTabID === u.id ? 'bordered' : ''}`}>
            <a
              className="flex flex-row"
              onClick={() => {
                setActiveTabID(u.id);
              }}
            >
              <CombatUnitName unit={u} />
            </a>
          </li>
        ))}
      </ul>
      {activeTabID === 'ttab-1' ? <TeamCurves combatants={enemies} /> : null}
      {activeTabID === 'ttab-2' ? <TeamCurves combatants={friends} /> : null}
      {activeTabID && combat.units[activeTabID] ? <PlayerCurves unit={combat.units[activeTabID]} /> : null}
    </div>
  );
};
