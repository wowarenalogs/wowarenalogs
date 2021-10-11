import { Progress, Card } from 'antd';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';
import _ from 'lodash';
import { useTranslation } from 'next-i18next';
import { useContext } from 'react';
import { CombatUnitSpec, getClassColor } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { Utils } from '../../../../utils';
import { Box } from '../../../common/Box';
import { CombatReportContext } from '../CombatReportContext';

export function Meters() {
  const { t } = useTranslation();
  const { combat, players, playerTotalDamageOut, playerTotalHealOut } = useContext(CombatReportContext);

  const playersSortedByDamage = players.slice();
  playersSortedByDamage.sort((a, b) => {
    const ad = playerTotalDamageOut.get(a.id) || 0;
    const bd = playerTotalDamageOut.get(b.id) || 0;
    return bd - ad;
  });

  const playersSortedByHeals = players.slice();
  playersSortedByHeals.sort((a, b) => {
    const ad = playerTotalHealOut.get(a.id) || 0;
    const bd = playerTotalHealOut.get(b.id) || 0;
    return bd - ad;
  });

  const maxDam = Math.max(...Array.from(playerTotalDamageOut.values()));
  const maxHeal = Math.max(...Array.from(playerTotalHealOut.values()));

  return (
    <>
      <Box mb={2}>
        <Card>
          <Title level={5}>{t('combat-report-damage-meter-damage')}</Title>
          {playersSortedByDamage.map((u, i) => (
            <Box display="flex" flexDirection="row" key={`${u.id}`}>
              <Box flex={4} display={'flex'} textAlign="left" justifyContent={'space-between'}>
                <Box flex={1} alignItems={'center'} display="flex" flexDirection="row" style={{ minWidth: 0 }}>
                  <Box
                    mr={1}
                    className={styles['unit-name-spec-icon-small']}
                    style={{
                      backgroundImage:
                        u.spec === CombatUnitSpec.None
                          ? `url(${Utils.getClassIcon(u.class)})`
                          : `url(${Utils.getSpecIcon(u.spec)})`,
                    }}
                    title={u.spec === CombatUnitSpec.None ? Utils.getClassName(u.class) : Utils.getSpecName(u.spec)}
                  />
                  <span style={{ color: getClassColor(u.class) }} className={styles['unit-name']}>
                    {u.name}
                  </span>
                </Box>
                <Text type="danger">{`${Utils.printCombatNumber(
                  playerTotalDamageOut.get(u.id) || 0,
                )} (${Utils.printCombatNumber(
                  (playerTotalDamageOut.get(u.id) || 0) / (combat?.endInfo.matchDurationInSeconds || 1),
                )}/s)`}</Text>
              </Box>
              <Box pl={2} width={128}>
                <Progress
                  percent={((playerTotalDamageOut.get(u.id) || 0) * 100) / maxDam}
                  strokeColor={getClassColor(u.class)}
                  showInfo={false}
                  trailColor="transparent"
                />
              </Box>
            </Box>
          ))}
        </Card>
      </Box>
      <Card>
        <Box>
          <Title level={5}>{t('combat-report-damage-meter-healing')}</Title>
          {playersSortedByHeals.map((u, i) => (
            <Box display="flex" flexDirection="row" key={`${u.id}`}>
              <Box flex={4} display={'flex'} textAlign="left" justifyContent={'space-between'}>
                <Box flex={1} alignItems={'center'} display="flex" flexDirection="row" style={{ minWidth: 0 }}>
                  <Box
                    mr={1}
                    className={styles['unit-name-spec-icon-small']}
                    style={{
                      backgroundImage:
                        u.spec === CombatUnitSpec.None
                          ? `url(${Utils.getClassIcon(u.class)})`
                          : `url(${Utils.getSpecIcon(u.spec)})`,
                    }}
                    title={u.spec === CombatUnitSpec.None ? Utils.getClassName(u.class) : Utils.getSpecName(u.spec)}
                  />
                  <span style={{ color: getClassColor(u.class) }} className={styles['unit-name']}>
                    {u.name}
                  </span>
                </Box>
                <Text type="success">{`${Utils.printCombatNumber(
                  playerTotalHealOut.get(u.id) || 0,
                )} (${Utils.printCombatNumber(
                  (playerTotalHealOut.get(u.id) || 0) / (combat?.endInfo.matchDurationInSeconds || 1),
                )}/s)`}</Text>
              </Box>
              <Box pl={2} width={128}>
                <Progress
                  percent={((playerTotalHealOut.get(u.id) || 0) * 100) / maxHeal}
                  strokeColor={getClassColor(u.class)}
                  showInfo={false}
                  trailColor="transparent"
                />
              </Box>
            </Box>
          ))}
        </Box>
      </Card>
    </>
  );
}
