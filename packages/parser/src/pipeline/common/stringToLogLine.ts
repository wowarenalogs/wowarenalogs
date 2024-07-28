import { pipe } from 'rxjs';
import { map } from 'rxjs/operators';

import { parseWowToJSON } from '../../jsonparse';
import { logDebug } from '../../logger';
import { ILogLine, LogEvent } from '../../types';
import { getTimestamp } from './utils';

const LINE_PARSER = /^(\d+)\/(\d+)\/(\d+)?\s+(\d+):(\d+):(\d+)\.(\d+)?(-\d+)\s+([A-Z_]+),(.+)\s*$/;
let nextId = 0;

export const stringToLogLine = (timezone: string) => {
  return pipe(
    map((line: string): ILogLine | string => {
      const regex_matches = line.match(LINE_PARSER);

      // not a valid line
      if (!regex_matches || regex_matches.length === 0) {
        logDebug(`INVALID LINE: ${line}`);
        return line;
      }

      const month = parseInt(regex_matches[1], 10);
      const day = parseInt(regex_matches[2], 10);
      const year = parseInt(regex_matches[3], 10);

      const hour = parseInt(regex_matches[4], 10);
      const minute = parseInt(regex_matches[5], 10);
      const second = parseInt(regex_matches[6], 10);
      const ms = parseInt(regex_matches[7], 10);

      const hasTZ = regex_matches[8].startsWith('-') || regex_matches[8].startsWith('+');
      const eventIndex = hasTZ ? 9 : 8;

      const eventName = regex_matches[eventIndex];

      // unsupported event
      if (!(eventName in LogEvent)) {
        logDebug(`UNSUPPORTED EVENT: ${eventName}`);
        return line;
      }

      const event = LogEvent[eventName as keyof typeof LogEvent];
      const jsonParameters = parseWowToJSON(regex_matches[eventIndex + 1]);
      const timestamp = getTimestamp(month, day, year, hour, minute, second, ms, timezone);

      return {
        id: (nextId++).toFixed(),
        timestamp,
        event,
        parameters: jsonParameters.data,
        raw: line,
        timezone,
      };
    }),
  );
};
