import { map } from 'rxjs/operators';

import { parseWowToJSON } from '../../jsonparse';
import { logDebug, logInfo } from '../../logger';
import { ILogLine, LogEvent } from '../../types';

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
    const decodedDate = new Date(correctPositiveTZInfo(tsString));
    const timestamp = decodedDate.getTime();

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
