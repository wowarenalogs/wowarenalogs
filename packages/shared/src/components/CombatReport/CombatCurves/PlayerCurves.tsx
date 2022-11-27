import { ICombatUnit } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useMemo } from 'react';

import { useCombatReportContext } from '../CombatReportContext';
import { CHART_TIME_INTERVAL_S, getDataPoint } from './constants';
import { CurveChart } from './CurveChart';

interface IProps {
  unit: ICombatUnit;
}

export const PlayerCurves = (props: IProps) => {
  const { combat } = useCombatReportContext();
  const data = useMemo(() => {
    if (!combat) {
      return [];
    }

    return _.range(
      0,
      Math.ceil((combat.endTime - combat.startTime) / 1000) + CHART_TIME_INTERVAL_S,
      CHART_TIME_INTERVAL_S,
    ).flatMap((timeMark) => {
      return {
        timeMark,
        'damage-out': getDataPoint(timeMark, combat.startTime, props.unit.damageOut),
        'damage-in': getDataPoint(timeMark, combat.startTime, props.unit.damageIn),
        'heal-out': getDataPoint(timeMark, combat.startTime, props.unit.healOut),
        'heal-in': getDataPoint(timeMark, combat.startTime, props.unit.healIn),
      };
    });
  }, [combat, props.unit]);

  return (
    <div className="flex flex-col flex-1">
      <table className="table mb-4">
        <thead>
          <tr>
            <th className="bg-base-300">Output</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="bg-base-200">
              <div className="w-full h-72 relative">
                <CurveChart
                  data={data}
                  series={[
                    {
                      key: 'damage-out',
                      displayName: 'Damage Done Per Second',
                      color: '#dc2828',
                    },
                    {
                      key: 'heal-out',
                      displayName: 'Healing Done Per Second',
                      color: '#16a249',
                    },
                  ]}
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <table className="table mb-4">
        <thead>
          <tr>
            <th className="bg-base-300">Intake</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="bg-base-200">
              <div className="w-full h-72 relative">
                <CurveChart
                  data={data}
                  series={[
                    {
                      key: 'damage-in',
                      displayName: 'Damage Intake Per Second',
                      color: '#dc2828',
                    },
                    {
                      key: 'heal-in',
                      displayName: 'Healing Intake Per Second',
                      color: '#16a249',
                    },
                  ]}
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
