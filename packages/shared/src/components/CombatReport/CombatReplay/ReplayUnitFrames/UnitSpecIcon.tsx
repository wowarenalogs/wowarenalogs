import { Utils } from '../../../../utils/utils';
import { IUnitFrameRenderData } from './UnitFrame';
import styles from './UnitSpecIcon.module.css';

export const UnitSpecIcon = (props: IUnitFrameRenderData) => {
  const url = Utils.getSpecIcon(props.unit.spec);
  const specName = Utils.getSpecName(props.unit.spec);

  return (
    <div className={styles['unit-frame-spec-icon-root']} title={specName}>
      <div className={styles['unit-frame-spec-icon']} style={{ backgroundImage: `url(${url})` }} />
      <div className={styles['unit-frame-spec-icon-ring']} />
    </div>
  );
};
