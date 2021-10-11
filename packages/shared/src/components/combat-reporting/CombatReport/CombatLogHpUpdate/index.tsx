import { Tooltip } from 'antd';
import { useTranslation } from 'next-i18next';
import { CombatHpUpdateAction, ICombatUnit, CombatUnitClass, getClassColor, ICombatData } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { Utils } from '../../../../utils';
import { Box } from '../../../common/Box';

interface IProps {
  action: CombatHpUpdateAction;
  unit: ICombatUnit;
  combat: ICombatData;
  groupTotal: number;
  timelineMax: number;
}

export const CombatReportHpUpdate = (props: IProps) => {
  const { t } = useTranslation();

  const colorSourceUnitId =
    props.action.destUnitId === props.unit.id ? props.action.srcUnitId : props.action.destUnitId;
  const colorSourceUnit = props.combat.units[colorSourceUnitId];
  const colorSourceUnitClass = colorSourceUnit ? colorSourceUnit.class : CombatUnitClass.None;

  const widthPercentage = (Math.abs(props.action.amount) / props.groupTotal) * 100;
  const widthPercentageAbsolute = (Math.abs(props.action.amount) / props.timelineMax) * 100;

  return (
    <Tooltip
      title={`${props.action.spellName || t('combat-report-auto-attack')}: ${Math.abs(props.action.amount).toFixed()}`}
    >
      <div
        className={styles['combat-report-hp-update-bar']}
        style={{
          backgroundColor: getClassColor(colorSourceUnitClass),
          width: widthPercentage.toFixed(2) + '%',
        }}
      >
        {widthPercentageAbsolute >= 10 && props.action.spellId ? (
          <Box
            className={styles['combat-report-hp-update-spell-icon']}
            style={{
              backgroundImage: `url(${Utils.getSpellIcon(
                props.action.spellId,
              )}), url(https://images.wowarenalogs.com/spells/0.jpg)`,
            }}
          />
        ) : null}
      </div>
    </Tooltip>
  );
};
