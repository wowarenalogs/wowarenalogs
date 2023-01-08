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
const SPEC_TO_CLASS = SPECS.reduce((prev, cur) => {
  prev[cur[2] as CombatUnitSpec] = cur[0].toLowerCase();
  return prev;
}, {} as Record<CombatUnitSpec, string>);

export function SpecSelector({
  spec,
  addCallback,
  removeCallback,
  modalKey,
}: {
  spec: CombatUnitSpec;
  addCallback: (s: CombatUnitSpec) => void;
  removeCallback: (s: CombatUnitSpec) => void;
  modalKey: string;
}) {
  const [isShowing, setIsShowing] = useState(false);
  const modalId = `modal-${modalKey}`;

  if (spec) {
    return (
      <div
        className={`inline-block w-[48px] h-[48px] border-${SPEC_TO_CLASS[spec]} border-2 rounded hover:opacity-20 hover:border-red-600 hover:border-2`}
        onClick={() => removeCallback(spec)}
      >
        <SpecImage specId={spec} size={44} />
      </div>
    );
  }

  return (
    <div className="dropdown w-[48px] h-[48px]">
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
        htmlFor={modalId}
        className="btn bg-primary-focus/50 hover:border-accent-focus hover:border-2 w-[48px] border rounded"
      >
        ?
      </label>
      <input type="checkbox" id={modalId} className="modal-toggle" />
      <label htmlFor={modalId} className="modal cursor-pointer">
        <div className="modal-box w-[340px] max-w-5xl">
          <div className="grid grid-cols-2 gap-y-2 gap-x-9">
            {/* Druid is the only class with 4 specs, this handles putting all the other classes */}
            {/* into a 2 column layout and then druid at the bottom is allowed to be wider */}
            {SPEC_BY_CLASS.filter((s) => s[0][0] !== 'Druid').map((s) => {
              return (
                <div className="" key={s[0][0]}>
                  <div className="flex flex-row space-x-1">
                    {s.map((a) => (
                      <div
                        className={`border-${
                          SPEC_TO_CLASS[a[2] as CombatUnitSpec]
                        } rounded border-2 box-border transition-colors duration-150`}
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
          <div className="mt-2">
            {SPEC_BY_CLASS.filter((s) => s[0][0] === 'Druid').map((s) => {
              return (
                <div className="" key={s[0][0]}>
                  <div className="flex flex-row space-x-1">
                    {s.map((a) => (
                      <div
                        className={`border-${
                          SPEC_TO_CLASS[a[2] as CombatUnitSpec]
                        } rounded border-2 box-border transition-colors duration-150`}
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
      </label>
    </div>
  );
}
