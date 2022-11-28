import { getClassColor } from '@wowarenalogs/parser';

import { Utils } from '../../../../utils/utils';
import { IUnitFrameRenderData } from './UnitFrame';
import styles from './UnitHpBar.module.css';

export const UnitHpBar = (props: IUnitFrameRenderData) => {
  const hpDisplay = Utils.printCombatNumber(props.hp.current);
  return (
    <div className={styles['unit-frame-hp-bar-root']}>
      <div
        className={styles['unit-frame-hp-bar-fill']}
        style={{
          backgroundColor: getClassColor(props.unit.class),
          width: `${Math.min(100, (props.hp.current * 100) / props.hp.max).toFixed()}%`,
        }}
      />
      {props.hp.max > 1 && <div className={styles['unit-frame-hp-bar-text']}>{hpDisplay}</div>}
    </div>
  );
};
