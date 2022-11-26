import { getPowerColor } from '@wowarenalogs/parser';

import { IUnitFrameRenderData } from './UnitFrame';
import styles from './UnitPowerBar.module.css';

export const UnitPowerBar = (props: IUnitFrameRenderData) => {
  return (
    <div className={styles['unit-frame-power-bar-root']}>
      <div
        className={styles['unit-frame-power-bar-fill']}
        style={{
          backgroundColor: getPowerColor(props.mp.type),
          width: `${Math.min(100, (props.mp.current * 100) / props.mp.max).toFixed()}%`,
        }}
      />
    </div>
  );
};
