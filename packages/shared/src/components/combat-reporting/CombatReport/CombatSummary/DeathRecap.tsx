import { Card } from 'antd';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';
import _ from 'lodash';
import { useTranslation } from 'next-i18next';
import { useContext } from 'react';
import { getClassColor, WowVersion, ICombatUnit } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { Utils } from '../../../../utils';
import { isCrit } from '../../../../utils/parserShims';
import { Box } from '../../../common/Box';
import { CombatReportContext } from '../CombatReportContext';

interface IProps {
  unit: ICombatUnit;
  wowVersion: WowVersion;
}

export function DeathRecap(props: IProps) {
  const { t } = useTranslation();
  const { players } = useContext(CombatReportContext);

  const targ = props.unit;

  let takenAbils = targ.damageIn.map((e) => e).filter((a) => a.amount < -1000);
  takenAbils = takenAbils.slice(Math.max(takenAbils.length - 10, 0), takenAbils.length).reverse();
  const timebasis = takenAbils[0]?.timestamp || 0;

  const defaultVal: Record<string, string> = {};
  const colorMap = players.reduce((prev, cur, curIdx, ary) => {
    prev[cur.id] = getClassColor(cur.class);
    return prev;
  }, defaultVal);

  return (
    <Card>
      <Box mb={2}>
        <Title level={5}>
          <img
            alt={t('Death summary')}
            src={`https://images.wowarenalogs.com/spells/237274.jpg`}
            width={22}
            height={22}
            style={{ borderRadius: 11, marginRight: 4 }}
          />
          {targ.name}
        </Title>
        <Box display="flex" flexDirection={'column'}>
          {takenAbils.map((u, i) => (
            <Box key={`${u.logLine.raw}`} display={'flex'}>
              <Box flex={1} mr={1} style={{ overflow: 'hidden' }}>
                <span
                  style={{ color: colorMap[u.srcUnitId] || 'white' }}
                  className={styles['unit-name']}
                  title={`${u.srcUnitName} - ${u.spellName || 'Auto-Attack'}`}
                >
                  {u.spellName || 'Auto-Attack'}
                </span>
              </Box>
              <Box width={60} alignItems={'center'}>
                <Text type="danger">
                  {Utils.printCombatNumber(-u.amount)}
                  {isCrit(u, props.wowVersion) ? '*' : ''}
                </Text>
              </Box>
              <Box width={60} alignItems={'center'}>
                <Text type="danger">{(u.timestamp - timebasis) / 1000}s</Text>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Card>
  );
}
