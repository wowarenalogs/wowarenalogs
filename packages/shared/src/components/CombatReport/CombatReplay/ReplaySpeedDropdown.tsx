import React from 'react';
import { TbCaretDown } from 'react-icons/tb';

interface IProps {
  setSpeed: (v: number) => void;
  speed: number;
}

const SPEED_DISPLAY_TEXT = new Map<number, string>([
  [0.25, 'Very Slow'],
  [0.5, 'Slow'],
  [1, 'Normal Speed'],
  [2, 'Fast'],
  [4, 'Very Fast'],
]);

export const ReplaySpeedDropdown = React.memo(function ReplaySpeedDropdown(props: IProps) {
  return (
    <div className="dropdown">
      <label className="btn btn-sm btn-ghost" tabIndex={0}>
        {SPEED_DISPLAY_TEXT.get(props.speed) || ''}&nbsp;
        <TbCaretDown />
      </label>
      <ul className="dropdown-content menu menu-compact p-2 shadow bg-base-300 rounded-box w-52" tabIndex={0}>
        {Array.from(SPEED_DISPLAY_TEXT.entries()).map(([speedValue, text]) => (
          <li key={speedValue}>
            <a
              onClick={() => {
                props.setSpeed(speedValue);
              }}
            >
              {text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});
