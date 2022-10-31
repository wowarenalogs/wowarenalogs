import moment from 'moment';
import { pipe } from 'rxjs';
import { map } from 'rxjs/operators';

import { parseWowToJSON } from '../../jsonparse';
import { ILogLine, LogEvent } from '../../types';

const LINE_PARSER = /^(\d+)\/(\d+)\s+(\d+):(\d+):(\d+)\.(\d+)\s+([A-Z_]+),(.+)\s*$/;
let nextId = 0;

export const stringToLogLine = () => {
  return pipe(
    map((line: string): ILogLine | string => {
      const regex_matches = line.match(LINE_PARSER);

      // not a valid line
      if (!regex_matches || regex_matches.length === 0) {
        return line;
      }

      const month = parseInt(regex_matches[1], 10);
      const day = parseInt(regex_matches[2], 10);
      const hour = parseInt(regex_matches[3], 10);
      const minute = parseInt(regex_matches[4], 10);
      const second = parseInt(regex_matches[5], 10);
      const ms = parseInt(regex_matches[6], 10);

      const eventName = regex_matches[7];

      // unsupported event
      if (!(eventName in LogEvent)) {
        return line;
      }
      const event = LogEvent[eventName as keyof typeof LogEvent];

      const timestampValueObj = {
        ms,
        M: month - 1,
        d: day,
        h: hour,
        m: minute,
        s: second,
      };
      const timestampValue = moment(timestampValueObj);
      const timestamp = timestampValue.valueOf();

      const jsonParameters = parseWowToJSON(regex_matches[8]);

      return {
        id: (nextId++).toFixed(),
        timestamp,
        event,
        parameters: jsonParameters.data,
        raw: line,
      };
    }),
  );
};
