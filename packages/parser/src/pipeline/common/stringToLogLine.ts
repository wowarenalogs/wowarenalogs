import { pipe } from 'rxjs';
import { map } from 'rxjs/operators';

import { parseWowToJSON } from '../../jsonparse';
import { logDebug } from '../../logger';
import { ILogLine, IParseError, LogEvent } from '../../types';

const LINE_PARSER = /^(.*)? {2}([A-Z_]+),(.+)\s*$/;
let nextId = 0;

/** Blizzard timestamp writer currently does not print any separator between the milliseconds
 * and the timezone information. This function corrects the timestamp to have a '+' sign
 */
function correctPositiveTZInfo(timestamp: string): string {
  const decimalSplit = timestamp.split('.');
  const millis = decimalSplit[1].slice(0, 3);
  const tsInfo = parseInt(decimalSplit[1].slice(3));
  if (tsInfo >= 0) {
    return `${decimalSplit[0]}.${millis}+${tsInfo}`;
  }
  return timestamp;
}

export const stringToLogLine = (timezone: string) => {
  return pipe(
    map((line: string): ILogLine | string | IParseError => {
      try {
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
        const decodedDate = new Date(correctPositiveTZInfo(tsString));
        const timestamp = decodedDate.getTime();

        return {
          id: (nextId++).toFixed(),
          timestamp,
          event,
          parameters: jsonParameters.data,
          raw: line,
          timezone,
        };
      } catch (error) {
        return {
          dataType: 'ParseError',
          pipeline: 'stringToLogLine',
          error: error as Error,
        };
      }
    }),
  );
};
