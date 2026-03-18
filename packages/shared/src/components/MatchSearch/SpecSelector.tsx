import { CombatUnitSpec } from '@wowarenalogs/parser';

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
const SPEC_TO_CLASS = SPECS.reduce(
  (prev, cur) => {
    prev[cur[2] as CombatUnitSpec] = cur[0].toLowerCase();
    return prev;
  },
  {} as Record<CombatUnitSpec, string>,
);

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
  const modalId = `modal-${modalKey}`;

  function closeModal() {
    const modalInput = document.getElementById(modalId);
    if (modalInput instanceof HTMLInputElement) {
      modalInput.checked = false;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  if (spec) {
    return (
      <div
        className={`inline-block h-[48px] w-[48px] rounded border-2 border-${SPEC_TO_CLASS[spec]} hover:border-2 hover:border-red-600 hover:opacity-20`}
        onClick={() => removeCallback(spec)}
      >
        <SpecImage specId={spec} size={44} />
      </div>
    );
  }

  return (
    <div className="h-[48px] w-[48px]">
      <label
        tabIndex={0}
        htmlFor={modalId}
        className="btn h-[48px] min-h-[48px] w-[48px] rounded border bg-primary-focus/50 p-0 text-lg hover:border-2 hover:border-accent-focus"
      >
        ?
      </label>
      <input type="checkbox" id={modalId} className="modal-toggle" />
      <label htmlFor={modalId} className="modal cursor-pointer">
        <div className="modal-box w-full max-w-sm p-4 sm:max-w-md">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Druid is the only class with 4 specs, this handles putting all the other classes */}
            {/* into a 2 column layout and then druid at the bottom is allowed to be wider */}
            {SPEC_BY_CLASS.filter((s) => s[0][0] !== 'Druid').map((s) => {
              return (
                <div key={s[0][0]}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">{s[0][0]}</div>
                  <div className="flex flex-wrap gap-1">
                    {s.map((a) => (
                      <div
                        className={`border-${
                          SPEC_TO_CLASS[a[2] as CombatUnitSpec]
                        } rounded border-2 box-border transition-colors duration-150`}
                        key={a[2]}
                        onClick={() => {
                          addCallback(a[2] as CombatUnitSpec);
                          closeModal();
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
                <div key={s[0][0]}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">{s[0][0]}</div>
                  <div className="flex flex-wrap gap-1">
                    {s.map((a) => (
                      <div
                        className={`border-${
                          SPEC_TO_CLASS[a[2] as CombatUnitSpec]
                        } rounded border-2 box-border transition-colors duration-150`}
                        key={a[2]}
                        onClick={() => {
                          addCallback(a[2] as CombatUnitSpec);
                          closeModal();
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
