import { Tooltip } from 'antd';
import { CombatUnitSpec, ICombatUnit } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { Utils } from '../../../../../../utils';
import { CombatUnitName } from '../../../CombatUnitName';

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
    <Tooltip title={props.unit.name}>
      <div className={styles['replay-event-unit-icon-root']}>
        <div className={styles['replay-event-unit-icon']} style={{ backgroundImage: `url(${specUrl})` }} />
        <div className={styles['replay-event-unit-icon-ring']} />
      </div>
    </Tooltip>
  );
}
