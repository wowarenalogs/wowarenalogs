import _ from 'lodash';
import { useState } from 'react';

import { useCombatReportContext } from '../CombatReportContext';

const lowerIncludes = (e: string, x: string) => {
  return e.toLowerCase().includes(x.toLowerCase());
};

export const CombatLogView = () => {
  const { combat } = useCombatReportContext();
  const [textFilter, setTextFilter] = useState('');

  if (!combat) return <div>Could not read combat</div>;

  const lines = combat.rawLines.filter((e) => lowerIncludes(e, textFilter));
  const debouncedUpdate = _.debounce(setTextFilter, 300);

  return (
    <div>
      <input
        placeholder="search log..."
        className="input input-bordered w-full max-w-xs"
        onChange={(evt) => {
          debouncedUpdate(evt.target.value);
        }}
      />
      <div className="mt-4">
        <textarea className="textarea textarea-bordered w-full h-full text-xs" value={lines.join('\n')} />
      </div>
    </div>
  );
};
