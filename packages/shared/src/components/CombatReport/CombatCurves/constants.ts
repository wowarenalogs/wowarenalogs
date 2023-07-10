import { CombatAbsorbAction, CombatHpUpdateAction } from '@wowarenalogs/parser';
import _ from 'lodash';

export const CHART_TIME_INTERVAL_S = 2;

export const getDataPoint = (
  timeMark: number,
  startTime: number,
  logs: (CombatHpUpdateAction | CombatAbsorbAction)[],
) => {
  return _.sumBy(
    logs.filter(
      (l) =>
        l.timestamp - startTime < timeMark * 1000 &&
        l.timestamp - startTime >= (timeMark - CHART_TIME_INTERVAL_S) * 1000,
    ),
    (l) => Math.round(Math.abs(l.effectiveAmount) / CHART_TIME_INTERVAL_S),
  );
};
