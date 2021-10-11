import styles from './UnitCovenantIcon.module.css';

import { CovenantIcon } from '../../CombatUnitName/CovenantIcon';
import { IUnitFrameRenderData } from './UnitFrame';

export const UnitCovenantIcon = (props: IUnitFrameRenderData) => {
  return (
    <>
      <div className={styles['unit-frame-covenant-icon']}>
        <CovenantIcon size={'small'} covenantId={props.unit.info?.covenantInfo.covenantId || ''} />
      </div>
    </>
  );
};
