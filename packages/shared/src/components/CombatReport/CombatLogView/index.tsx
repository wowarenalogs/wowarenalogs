import { stringToLogLine } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useState } from 'react';
import { from } from 'rxjs';

import { useCombatReportContext } from '../CombatReportContext';

const lowerIncludes = (e: string, x: string) => {
  return e.toLowerCase().includes(x.toLowerCase());
};

export const CombatLogView = () => {
  const { combat } = useCombatReportContext();
  const [textFilter, setTextFilter] = useState('');
  const [parsedLogLine, setParsedLogLine] = useState('');

  if (!combat) return <div>Could not read combat</div>;

  // Intentionally logging to JS console here for debugging
  // eslint-disable-next-line no-console
  console.log({ combat });

  const lines = combat.rawLines.filter((e) => lowerIncludes(e, textFilter));
  const debouncedUpdate = _.debounce(setTextFilter, 300);

  return (
    <div className="flex flex-col flex-1 gap-2">
      <input
        placeholder="search log..."
        className="input input-bordered w-full"
        onChange={(evt) => {
          debouncedUpdate(evt.target.value);
        }}
      />
      <textarea className="textarea textarea-bordered w-full text-xs flex-1" value={lines.join('\n')} />
      <input
        placeholder="Debug log line..."
        className="input input-bordered w-full"
        onChange={(evt) => {
          from([evt.target.value])
            .pipe(stringToLogLine(combat.timezone))
            .forEach((line) => {
              // eslint-disable-next-line no-console
              console.log(line);
              setParsedLogLine(JSON.stringify(line, null, 2));
            });
        }}
      />
      <pre>{parsedLogLine}</pre>
    </div>
  );
};
