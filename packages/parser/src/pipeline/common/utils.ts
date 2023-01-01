import moment from 'moment-timezone';

export function isNonNull<T>(value: T): value is NonNullable<T> {
  return value != null;
}

export function getTimestamp(
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timezone: string,
  now?: number,
) {
  const machineTimeNow = now ?? moment().valueOf();
  const machineYear = moment(machineTimeNow).year();

  return (
    // try the year before, the current year, and the year after
    [-1, 0, 1]
      .map((yearOffset) => {
        const guessYear = machineYear + yearOffset;
        return moment
          .tz(
            {
              ms,
              M: month - 1,
              d: day,
              h: hour,
              m: minute,
              s: second,
              y: guessYear,
            },
            timezone,
          )
          .valueOf();
      })
      // remove candidates who are more than 24 hours into the future
      .filter((guess) => guess <= machineTimeNow + 1000 * 60 * 60 * 24)
      // return one of the remaining candidates who are closest to the machine time
      .sort((a, b) => Math.abs(a - machineTimeNow) - Math.abs(b - machineTimeNow))[0]
  );
}
