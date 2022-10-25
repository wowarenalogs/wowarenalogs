import { getApolloContext } from '@apollo/client';
import { Card, Divider, Tag } from 'antd';
import Title from 'antd/lib/typography/Title';
import _ from 'lodash';
import moment from 'moment';
import { useTranslation } from 'next-i18next';
import { useContext } from 'react';
import { CombatResult } from 'wow-combat-log-parser';

import { useGetProfileQuery } from '../../../../graphql/__generated__/graphql';
import { Utils } from '../../../../utils';
import { canUseFeature } from '../../../../utils/features';
import { Box } from '../../../common/Box';
import { CombatReportContext } from '../CombatReportContext';
import { CombatStatistic } from '../CombatStatistic';
import { DeathRecap } from './DeathRecap';
import { FreezingTraps } from './FreezingTraps';
import { Meters } from './Meters';
import { PlayerRow } from './PlayerRow';

export function CombatSummary() {
  const { t } = useTranslation();
  const context = useContext(getApolloContext());
  const { data } = useGetProfileQuery({
    client: context.client,
  });

  const { combat, isAnonymized, enemies, friends, players } = useContext(CombatReportContext);
  if (!combat) {
    return null;
  }

  const deadPlayers = players
    .filter((u) => u.deathRecords.length > 0)
    .sort((a, b) => a.deathRecords[0].timestamp - b.deathRecords[0].timestamp);

  const enemyAvgItemLevel = enemies.length ? _.sumBy(enemies, (u) => Utils.getAverageItemLevel(u)) / enemies.length : 0;
  const friendsAvgItemLevel = enemies.length
    ? _.sumBy(friends, (u) => Utils.getAverageItemLevel(u)) / friends.length
    : 0;
  const iLvlAdvantage = friendsAvgItemLevel - enemyAvgItemLevel;

  return (
    <Box display="flex" flexDirection="column">
      <Box display="flex" flexDirection="row" mb={2}>
        <CombatStatistic
          title={t('combat-report-duration')}
          value={moment.utc(combat.endTime - combat.startTime).format('mm:ss')}
        />
        {combat.wowVersion === 'dragonflight' && (
          <>
            <Box ml={2}>
              <CombatStatistic title={t('combat-report-team-mmr')} value={combat.playerTeamRating.toFixed()} />
            </Box>
            {isAnonymized ? (
              <Box ml={2}>
                <CombatStatistic
                  title={t('combat-report-ilvl-difference')}
                  value={Math.abs(iLvlAdvantage).toFixed(1)}
                />
              </Box>
            ) : (
              <Box ml={2}>
                <CombatStatistic
                  title={t('combat-report-ilvl-advantage')}
                  value={iLvlAdvantage.toFixed(1)}
                  valueColor={iLvlAdvantage >= 0 ? '#49aa19' : '#a61d24'}
                />
              </Box>
            )}
            <Box ml={2}>
              <CombatStatistic title={'First Death'} value={deadPlayers[0].name} />
            </Box>
          </>
        )}
      </Box>
      <Box display="flex" flexDirection="row" flexWrap={'wrap'}>
        <Box mr={2} mb={2}>
          <Card>
            <Box display="flex" flexDirection="column">
              <Box display="flex" flexDirection="row">
                <Box width={320} display="flex" flexDirection="row">
                  {<Box>{isAnonymized ? t('combat-report-team-1') : t('combat-report-enemy-team')}</Box>}
                  {combat.result === CombatResult.Lose && (
                    <Box ml={1}>
                      <Tag color="success">{CombatResult[CombatResult.Win]}</Tag>
                    </Box>
                  )}
                </Box>
                <Box width={48} textAlign="left">
                  <Title level={5} type="secondary">
                    {t('combat-report-item-level-short')}
                  </Title>
                </Box>
                <Box width={64} textAlign="left">
                  <Title level={5} type="secondary">
                    {t('combat-report-in-cc')}
                  </Title>
                </Box>
                <Box width={64} textAlign="left">
                  <Title level={5} type="secondary">
                    {t('combat-report-kicks')}
                  </Title>
                </Box>
              </Box>

              {enemies.map((u) => {
                return <PlayerRow key={u.id} player={u} />;
              })}
              <Divider />
              <Box display="flex" flexDirection="row">
                {<Box>{isAnonymized ? t('combat-report-team-2') : t('combat-report-my-team')}</Box>}
                {combat.result === CombatResult.Win && (
                  <Box ml={1}>
                    <Tag color="success">{CombatResult[CombatResult.Win]}</Tag>
                  </Box>
                )}
              </Box>
              {friends.map((u) => {
                return <PlayerRow key={u.id} player={u} />;
              })}
            </Box>
          </Card>
        </Box>
        <Box mr={2} mb={2}>
          <Meters />
        </Box>
        {deadPlayers && (
          <Box mr={2} mb={2} width={300}>
            <DeathRecap unit={deadPlayers[0]} wowVersion={combat.wowVersion} />
          </Box>
        )}
        {canUseFeature(data?.me, 'experimental-features') && <FreezingTraps combat={combat} />}
      </Box>
    </Box>
  );
}
