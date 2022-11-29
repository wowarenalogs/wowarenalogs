import React from 'react';
import { TbCaretDown } from 'react-icons/tb';

import { Dropdown } from '../../common/Dropdown';

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
    <Dropdown
      menuItems={Array.from(SPEED_DISPLAY_TEXT.entries()).map(([speedValue, text]) => ({
        key: speedValue.toString(),
        label: text,
        onClick: () => props.setSpeed(speedValue),
      }))}
    >
      <>
        {SPEED_DISPLAY_TEXT.get(props.speed) || ''}&nbsp;
        <TbCaretDown />
      </>
    </Dropdown>
  );
});
