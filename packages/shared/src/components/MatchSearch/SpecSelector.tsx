import { CombatUnitSpec } from '@wowarenalogs/parser';
import { useRef, useState } from 'react';

import { SpecImage } from '../common/SpecImage';

const CLASS_NAMES = new Set();
const SPECS = Object.entries(CombatUnitSpec)
  .filter((c) => c[0].search('_') > -1)
  .map((c) => {
    const parts = c[0].split('_');
    CLASS_NAMES.add(parts[0]);
    return [parts[0], parts[1], c[1]];
  });

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
        className="inline-block w-[48px] h-[48px] mr-2 border-gray-400 border rounded"
        onClick={() => removeCallback(spec)}
      >
        <SpecImage specId={spec} size={48} />
      </div>
    );
  }
  return (
    <div className="dropdown w-[48px] h-[48px] mr-2">
      <label
        onClick={(e) => {
          if (isShowing) {
            document.activeElement.blur();
          }
          setIsShowing(!isShowing);
        }}
        tabIndex={0}
        className="btn w-[48px] border-gray-400 border rounded"
      >
        ?
      </label>
      <div tabIndex={0} className="dropdown-content div p-2 shadow bg-gray-900 rounded-box w-[124px]">
        {SPECS.map((s) => {
          return (
            <div
              className="inline-block"
              key={s[2]}
              onClick={(e) => {
                addCallback(s[2] as CombatUnitSpec);
              }}
            >
              <SpecImage specId={s[2]} size={36} />
            </div>
          );
        })}
      </div>
    </div>
  );
  // return (
  //   <select className="select w-full max-w-xs" onChange={(e) => props.addCallback(e.target.value as CombatUnitSpec)}>
  //     <option disabled selected>
  //       spec
  //     </option>
  //     {SPECS.map((s) => (
  //       <option key={s[2]} value={s[2]}>
  //         <SpecImage specId={s[2]} />
  //       </option>
  //     ))}
  //   </select>
  // );
}
