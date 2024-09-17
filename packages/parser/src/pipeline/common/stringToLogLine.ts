import { pipe } from 'rxjs';
import { map } from 'rxjs/operators';

import { parseWowToJSON } from '../../jsonparse';
import { logDebug } from '../../logger';
import { ILogLine, LogEvent } from '../../types';

const LINE_PARSER = /^(.*)? {2}([A-Z_]+),(.+)\s*$/;
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

      const tsString = regex_matches[1];
      const eventIndex = 2;
      const eventName = regex_matches[eventIndex];

      // unsupported event
      if (!(eventName in LogEvent)) {
        logDebug(`UNSUPPORTED EVENT: ${eventName}`);
        return line;
      }

      const event = LogEvent[eventName as keyof typeof LogEvent];
      const jsonParameters = parseWowToJSON(regex_matches[eventIndex + 1]);
      const decodedDate = new Date(tsString);
      const timestamp = decodedDate.getTime();

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
