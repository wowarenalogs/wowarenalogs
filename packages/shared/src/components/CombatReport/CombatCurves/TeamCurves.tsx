import { getClassColor, ICombatUnit } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useMemo } from 'react';

import { useCombatReportContext } from '../CombatReportContext';
import { CHART_TIME_INTERVAL_S, getDataPoint } from './constants';
import { CurveChart } from './CurveChart';

interface IProps {
  combatants: ICombatUnit[];
}

export const TeamCurves = (props: IProps) => {
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
      const result: Record<string, number> = {};
      props.combatants.forEach((c) => {
        result[`damage-out-${c.id}`] = getDataPoint(timeMark, combat.startTime, c.damageOut);
        result[`damage-in-${c.id}`] = getDataPoint(timeMark, combat.startTime, c.damageIn);
        result[`heal-out-${c.id}`] = getDataPoint(timeMark, combat.startTime, c.healOut);
        result[`heal-in-${c.id}`] = getDataPoint(timeMark, combat.startTime, c.healIn);
      });
      return {
        timeMark,
        ...result,
      };
    });
  }, [combat, props.combatants]);

  return (
    <div className="flex flex-col flex-1">
      <table className="table mb-4">
        <thead>
          <tr>
            <th className="bg-base-300 text-error">Damage Done Per Second</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="bg-base-200">
              <div className="w-full h-72 relative">
                <CurveChart
                  data={data}
                  series={props.combatants.map((c) => {
                    return {
                      key: `damage-out-${c.id}`,
                      displayName: c.name.split('-')[0],
                      color: getClassColor(c.class),
                    };
                  })}
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <table className="table mb-4">
        <thead>
          <tr>
            <th className="bg-base-300 text-success">Healing Done Per Second</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="bg-base-200">
              <div className="w-full h-72 relative">
                <CurveChart
                  data={data}
                  series={props.combatants.map((c) => {
                    return {
                      key: `heal-out-${c.id}`,
                      displayName: c.name.split('-')[0],
                      color: getClassColor(c.class),
                    };
                  })}
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <table className="table mb-4">
        <thead>
          <tr>
            <th className="bg-base-300 text-error">Damage Taken Per Second</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="bg-base-200">
              <div className="w-full h-72 relative">
                <CurveChart
                  data={data}
                  series={props.combatants.map((c) => {
                    return {
                      key: `damage-in-${c.id}`,
                      displayName: c.name.split('-')[0],
                      color: getClassColor(c.class),
                    };
                  })}
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <table className="table mb-4">
        <thead>
          <tr>
            <th className="bg-base-300 text-success">Healing Taken Per Second</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="bg-base-200">
              <div className="w-full h-72 relative">
                <CurveChart
                  data={data}
                  series={props.combatants.map((c) => {
                    return {
                      key: `heal-in-${c.id}`,
                      displayName: c.name.split('-')[0],
                      color: getClassColor(c.class),
                    };
                  })}
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
