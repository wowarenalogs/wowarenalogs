import { CombatResult, CombatUnitReaction, CombatUnitType, ICombatUnit } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useEffect, useMemo, useState } from 'react';

import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';
import { TeamCurves } from './TeamCurves';

export const CombatCurves = () => {
  const { combat, isAnonymized } = useCombatReportContext();
  const [activeCombatants, setActiveCombatants] = useState<ICombatUnit[]>([]);

  const players = useMemo(() => {
    return _.sortBy(
      _.values(combat?.units ?? []).filter((u) => u.type === CombatUnitType.Player),
      ['reaction', 'name'],
    );
  }, [combat]);
  const enemies = useMemo(() => {
    return players.filter((p) => p.reaction === CombatUnitReaction.Hostile);
  }, [players]);
  const friends = useMemo(() => {
    return players.filter((p) => p.reaction === CombatUnitReaction.Friendly);
  }, [players]);

  useEffect(() => {
    setActiveCombatants(enemies);
  }, [enemies]);

  if (!combat) {
    return null;
  }

  const toggleActiveCombatants = (combatants: ICombatUnit[]) => {
    setActiveCombatants((prev) => {
      if (combatants.every((c) => prev.includes(c))) {
        return prev.filter((c) => !combatants.includes(c));
      }
      const toAdd: ICombatUnit[] = [];
      combatants.forEach((c) => {
        if (!prev.includes(c)) {
          toAdd.push(c);
        }
      });
      return [...prev, ...toAdd];
    });
  };

  return (
    <div className="flex flex-row flex-1">
      <div className="top-0 flex flex-col">
        <ul className="menu mr-2 min-w-fit sticky top-0">
          <li key="ttab-1">
            <a
              className="flex flex-row"
              onClick={() => {
                toggleActiveCombatants(enemies);
              }}
            >
              <input
                readOnly
                type="checkbox"
                checked={enemies.every((u) => {
                  return activeCombatants.includes(u);
                })}
                className="checkbox checkbox-sm"
              />
              <div>{isAnonymized ? 'Team 1' : 'Enemy Team'}</div>
              {combat.result === CombatResult.Lose && (
                <div className="ml-2 badge badge-success">{CombatResult[CombatResult.Win]}</div>
              )}
            </a>
          </li>
          {enemies.map((u) => (
            <li key={u.id}>
              <a
                className="flex flex-row"
                onClick={() => {
                  toggleActiveCombatants([u]);
                }}
              >
                <input
                  readOnly
                  type="checkbox"
                  checked={activeCombatants.includes(u)}
                  className="checkbox checkbox-sm"
                />
                <CombatUnitName unit={u} />
              </a>
            </li>
          ))}
          <li key="ttab-2">
            <a
              className="flex flex-row"
              onClick={() => {
                toggleActiveCombatants(friends);
              }}
            >
              <input
                readOnly
                type="checkbox"
                checked={friends.every((u) => {
                  return activeCombatants.includes(u);
                })}
                className="checkbox checkbox-sm"
              />
              <div>{isAnonymized ? 'Team 2' : 'My Team'}</div>
              {combat.result === CombatResult.Win && (
                <div className="ml-2 badge badge-success">{CombatResult[CombatResult.Win]}</div>
              )}
            </a>
          </li>
          {friends.map((u) => (
            <li key={u.id}>
              <a
                className="flex flex-row"
                onClick={() => {
                  toggleActiveCombatants([u]);
                }}
              >
                <input
                  readOnly
                  type="checkbox"
                  checked={activeCombatants.includes(u)}
                  className="checkbox checkbox-sm"
                />
                <CombatUnitName unit={u} />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <TeamCurves combatants={activeCombatants} />
    </div>
  );
};
