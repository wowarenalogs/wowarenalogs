import { DownOutlined } from '@ant-design/icons';
import { Dropdown, Menu } from 'antd';
import React from 'react';

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

function speedOptions(setSpeed: (v: number) => void) {
  return (
    <Menu>
      {Array.from(SPEED_DISPLAY_TEXT.entries()).map(([speedValue, text]) => (
        <Menu.Item
          key={speedValue}
          onClick={() => {
            setSpeed(speedValue);
          }}
        >
          {text}
        </Menu.Item>
      ))}
    </Menu>
  );
}

export const ReplaySpeedDropdown = React.memo(function ReplaySpeedDropdown(props: IProps) {
  return (
    <Dropdown overlay={speedOptions(props.setSpeed)}>
      <span>
        {SPEED_DISPLAY_TEXT.get(props.speed) || ''} <DownOutlined />
      </span>
    </Dropdown>
  );
});
