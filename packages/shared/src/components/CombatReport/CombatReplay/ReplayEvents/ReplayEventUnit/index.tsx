import { CombatUnitSpec, ICombatUnit } from '@wowarenalogs/parser';

import { Utils } from '../../../../../utils/utils';
import { CombatUnitName } from '../../../CombatUnitName';
import styles from './index.module.css';

interface IProps {
  unit: ICombatUnit;
  expanded?: boolean;
}
export function ReplayEventUnit(props: IProps) {
  const specUrl =
    props.unit.spec === CombatUnitSpec.None ? Utils.getClassIcon(props.unit.class) : Utils.getSpecIcon(props.unit.spec);

  return props.expanded ? (
    <CombatUnitName unit={props.unit} />
  ) : (
    <div className="tooltip" data-tip={props.unit.name}>
      <div className={styles['replay-event-unit-icon-root']}>
        <div className={styles['replay-event-unit-icon']} style={{ backgroundImage: `url(${specUrl})` }} />
        <div className={styles['replay-event-unit-icon-ring']} />
      </div>
    </div>
  );
}
