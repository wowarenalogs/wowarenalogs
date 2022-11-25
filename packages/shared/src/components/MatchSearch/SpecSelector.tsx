import { CombatUnitSpec } from '@wowarenalogs/parser';
import { useState } from 'react';

import { SpecImage } from '../common/SpecImage';

const CLASS_NAMES = new Set();
const SPECS = Object.entries(CombatUnitSpec)
  .filter((c) => c[0].search('_') > -1)
  .map((c) => {
    const parts = c[0].split('_');
    CLASS_NAMES.add(parts[0]);
    return [parts[0], parts[1], c[1]];
  });
const SPEC_BY_CLASS = Array.from(CLASS_NAMES).map((c) => SPECS.filter((s) => s[0] === c));

export function SpecSelector({
  spec,
  addCallback,
  removeCallback,
}: {
  spec: CombatUnitSpec;
  addCallback: (s: CombatUnitSpec) => void;
  removeCallback: (s: CombatUnitSpec) => void;
}) {
  const [isShowing, setIsShowing] = useState(false);

  if (spec) {
    return (
      <div
        className="inline-block w-[48px] h-[48px] mr-2 border-gray-400 border rounded hover:opacity-20 hover:border-red-600 hover:border-2"
        onClick={() => removeCallback(spec)}
      >
        <SpecImage specId={spec} size={48} />
      </div>
    );
  }

  return (
    <div className="dropdown w-[48px] h-[48px] mr-2">
      <label
        onClick={() => {
          if (isShowing) {
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          }
          setIsShowing(!isShowing);
        }}
        tabIndex={0}
        onBlur={() => {
          setIsShowing(false);
        }}
        className="btn w-[48px] border-gray-400 border rounded"
      >
        ?
      </label>
      <div
        tabIndex={0}
        className="flex flex-wrap space-y-1 dropdown-content div p-2 shadow bg-gray-900 rounded-box w-[414px]"
      >
        {SPEC_BY_CLASS.map((s) => {
          return (
            <div className="mr-4" key={s[0][0]}>
              <div>{s[0][0]}</div>
              <div className="flex flex-row space-x-1">
                {s.map((a) => (
                  <div
                    className="hover:border-gray-600 rounded border-2 border-transparent box-border transition-colors duration-150"
                    key={a[2]}
                    onClick={() => {
                      addCallback(a[2] as CombatUnitSpec);
                    }}
                  >
                    <SpecImage specId={a[2]} size={36} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
