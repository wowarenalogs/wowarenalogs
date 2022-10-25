import { Tooltip } from 'antd';
import Text from 'antd/lib/typography/Text';
import { useTranslation } from 'next-i18next';
import { useContext } from 'react';
import { CombatUnitSpec, ICombatUnit } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { Utils } from '../../../../utils';
import { Box } from '../../../common/Box';
import { CombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';
import { EquipmentInfo } from '../EquipmentInfo';

interface IProps {
  player: ICombatUnit;
}

export function PlayerRow(props: IProps) {
  const { t } = useTranslation();
  const { combat, playerTimeInCC, playerInterrupts } = useContext(CombatReportContext);
  const u = props.player;

  if (!combat) {
    return null;
  }

  const interruptsPerMinute = (
    ((playerInterrupts.get(u.id) || 0) * 60) /
    (combat.endInfo?.matchDurationInSeconds || 1)
  ).toFixed(1);

  const trinkets = u.info?.equipment.filter((_, i) => [12, 13].includes(i)) || [];

  return (
    <Box display="flex" flexDirection="row" key={u.id} alignItems="center" mt={2}>
      <Box width={320} display="flex" flexDirection="row" justifyContent="flex-start" alignItems="center">
        <Box
          mr={1}
          className={styles['unit-name-spec-icon']}
          style={{
            backgroundImage:
              u.spec === CombatUnitSpec.None
                ? `url(${Utils.getClassIcon(u.class)})`
                : `url(${Utils.getSpecIcon(u.spec)})`,
          }}
          title={u.spec === CombatUnitSpec.None ? Utils.getClassName(u.class) : Utils.getSpecName(u.spec)}
        />
        <Box display="flex" flexDirection="column">
          <CombatUnitName unit={u} navigateToPlayerView showSpec={false} />
          <Box display="flex" flexDirection="row">
            {trinkets.map((e, i) => (
              <EquipmentInfo key={`${i}`} item={e} size={'small'} notext />
            ))}
          </Box>
        </Box>
      </Box>
      <Box width={48} textAlign="left">
        <Text>{Utils.getAverageItemLevel(u).toFixed()}</Text>
      </Box>
      <Box width={64} textAlign="left">
        <Text>{(((playerTimeInCC.get(u.id) || 0) * 100) / (combat.endTime - combat.startTime)).toFixed(1)}%</Text>
      </Box>
      <Box width={64} textAlign="left">
        <Tooltip title={`${t('combat-report-total-kicks')}: ${playerInterrupts.get(u.id) || 0}`}>
          <Text>{interruptsPerMinute}</Text>
          <Text type="secondary">{t('combat-report-per-minute')}</Text>
        </Tooltip>
      </Box>
    </Box>
  );
}
