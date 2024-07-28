import moment from 'moment-timezone';

export function isNonNull<T>(value: T): value is NonNullable<T> {
  return value != null;
}

export function getTimestamp(
  month: number,
  day: number,
  year: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timezone: string,
) {
  return moment
    .tz(
      {
        ms,
        M: month - 1,
        d: day,
        h: hour,
        m: minute,
        s: second,
        y: year,
      },
      timezone,
    )
    .valueOf();
}
