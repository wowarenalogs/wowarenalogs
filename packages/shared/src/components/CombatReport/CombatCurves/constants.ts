import _ from 'lodash';

export const CHART_TIME_INTERVAL_S = 2;

export const getDataPoint = <T extends { timestamp: number; effectiveAmount: number }>(
  timeMark: number,
  startTime: number,
  logs: T[],
  amountOf: (l: T) => number = (l) => Math.abs(l.effectiveAmount),
) => {
  return _.sumBy(
    logs.filter(
      (l) =>
        l.timestamp - startTime < timeMark * 1000 &&
        l.timestamp - startTime >= (timeMark - CHART_TIME_INTERVAL_S) * 1000,
    ),
    (l) => Math.round(amountOf(l) / CHART_TIME_INTERVAL_S),
  );
};
