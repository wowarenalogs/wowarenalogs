import { CombatUnitType, ICombatUnit, ILogLine } from '@wowarenalogs/parser';
import _ from 'lodash';
import moment from 'moment';
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
  const { combat } = useCombatReportContext();
  const [activePlayerDeathID, setActivePlayerDeathID] = useState<string | null>(null);

  const players = _.values(combat ? combat.units : {}).filter((u) => u.type === CombatUnitType.Player);
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

  useEffect(() => {
    if (activePlayerDeathID === null && allPlayerDeath.length > 0) {
      setActivePlayerDeathID(getDeathID(allPlayerDeath[0]));
    }
  }, [activePlayerDeathID, allPlayerDeath]);

  if (!combat) {
    return null;
  }

  return (
    <div className="flex flex-row flex-1">
      <ul className="menu mr-2">
        {allPlayerDeath.map((d) => {
          const deathID = getDeathID(d);
          const time = moment.utc(moment(d.deathRecord.timestamp).diff(moment(combat.startTime))).format('mm:ss');
          return (
            <li key={deathID} className={`${activePlayerDeathID === deathID ? 'bordered' : ''}`}>
              <a
                className="flex flex-col items-center"
                onClick={() => {
                  setActivePlayerDeathID(deathID);
                }}
              >
                <CombatUnitName unit={d.unit} />
                <div className="opacity-60">{time}</div>
              </a>
            </li>
          );
        })}
      </ul>
      {allPlayerDeath.map((d) => {
        const deathID = getDeathID(d);
        return (
          deathID === activePlayerDeathID && (
            <div key={deathID} className="flex-1 relative bg-base-300 rounded-box p-4">
              <CombatUnitTimelineView
                unit={d.unit}
                startTime={d.deathRecord.timestamp - 30 * 1000}
                endTime={d.deathRecord.timestamp}
              />
            </div>
          )
        );
      })}
    </div>
  );
}
