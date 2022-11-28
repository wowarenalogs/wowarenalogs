import { Utils } from '../../../../utils/utils';
import styles from './UnitClassIcon.module.css';
import { IUnitFrameRenderData } from './UnitFrame';

export const UnitClassIcon = (props: IUnitFrameRenderData) => {
  const classIconUrl = Utils.getClassIcon(props.unit.class);
  const auraIconUrl = props.highlightAura ? Utils.getSpellIcon(props.highlightAura.spellId) : null;
  return (
    <>
      <div className={styles['unit-frame-class-icon']} style={{ backgroundImage: `url(${classIconUrl})` }} />
      {props.highlightAura ? (
        <div className={styles['unit-frame-class-icon']} style={{ backgroundImage: `url(${auraIconUrl})` }} />
      ) : null}
    </>
  );
};
