import moment from 'moment-timezone';
import { map } from 'rxjs/operators';

import { parseWowToJSON } from '../../jsonparse';
import { logDebug, logInfo } from '../../logger';
import { ILogLine, LogEvent } from '../../types';

let nextId = 0;

const COMBAT_LOG_TIMESTAMP = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})\.(\d{3})([+-]?\d{1,2})?$/;

function parseCombatLogTimestamp(timestamp: string, timezone: string): number | null {
  const matches = timestamp.match(COMBAT_LOG_TIMESTAMP);
  if (!matches) {
    return null;
  }

  const [, monthString, dayString, yearString, hourString, minuteString, secondString, millisString, offsetString] =
    matches;
  const month = parseInt(monthString, 10);
  const day = parseInt(dayString, 10);
  const year = parseInt(yearString, 10);
  const hour = parseInt(hourString, 10);
  const minute = parseInt(minuteString, 10);
  const second = parseInt(secondString, 10);
  const millisecond = parseInt(millisString, 10);

  if (offsetString !== undefined) {
    const offsetHours = parseInt(offsetString, 10);
    return Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offsetHours * 60 * 60 * 1000;
  }

  const parsedMoment = moment.tz(
    {
      year,
      month: month - 1,
      date: day,
      hour,
      minute,
      second,
      millisecond,
    },
    timezone,
  );

  return parsedMoment.isValid() ? parsedMoment.valueOf() : null;
}

export const stringToLogLine = (timezone: string) => {
  return map((line: string): ILogLine | string => {
    const separatorIndex = line.indexOf('  ');
    if (separatorIndex === -1) {
      logDebug(`INVALID LINE: ${line}`);
      return line;
    }

    const tsString = line.slice(0, separatorIndex);
    const rest = line.slice(separatorIndex + 2);
    const commaIndex = rest.indexOf(',');
    if (commaIndex === -1) {
      logDebug(`INVALID LINE: ${line}`);
      return line;
    }

    const eventName = rest.slice(0, commaIndex);

    // unsupported event
    if (!(eventName in LogEvent)) {
      logDebug(`UNSUPPORTED EVENT: ${eventName}`);
      return line;
    }

    const event = LogEvent[eventName as keyof typeof LogEvent];
    const jsonPayload = rest.slice(commaIndex + 1).trimEnd();
    const jsonParameters = parseWowToJSON(jsonPayload);
    const timestamp = parseCombatLogTimestamp(tsString, timezone);

    if (timestamp === null || isNaN(timestamp)) {
      logInfo('INVALID TIMESTAMP', tsString);
      return line;
    }

    return {
      id: (nextId++).toFixed(),
      timestamp,
      event,
      parameters: jsonParameters.data,
      raw: line,
      timezone,
    };
  });
};
