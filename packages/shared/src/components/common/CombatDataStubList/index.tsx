/* eslint-disable jsx-a11y/anchor-is-valid */
import { Button, Divider, List, Space, Statistic, Tag } from 'antd';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';
import _ from 'lodash';
import moment from 'moment';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import { CombatUnitSpec, CombatResult, CombatUnitType, CombatUnitReaction } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { CombatDataStub } from '../../../graphql/__generated__/graphql';
import { Utils } from '../../../utils';
import { zoneMetadata } from '../../../utils/zoneMetadata';
import { Box } from '../Box';
import { TimestampDisplay } from '../TimestampDisplay';

export interface IProps {
  header?: string;
  showSummary?: boolean;
  viewerIsOwner?: boolean;
  combats: CombatDataStub[];
  combatUrlFactory: (id: string) => string;
  applyUtcFix?: boolean;
  loading?: boolean;
}

export function CombatDataStubList({
  header,
  combats,
  combatUrlFactory,
  applyUtcFix,
  loading,
  viewerIsOwner = true,
  showSummary = true,
}: IProps) {
  const { t } = useTranslation();
  const sortedCombats = _.sortBy(combats, (combat) => -combat.startTime);

  return (
    <Box flex={1} display="flex" flexDirection="column">
      {header && <Title level={2}>{header}</Title>}
      {showSummary && (
        <Box display="flex" flexDirection="row" my={2}>
          <Space size="middle">
            <Statistic
              title={t('wins')}
              value={combats.filter((c) => c.result === CombatResult.Win).length}
              valueStyle={{ color: '#49aa19' }}
            />
            <Statistic
              title={t('losses')}
              value={combats.filter((c) => c.result === CombatResult.Lose).length}
              valueStyle={{ color: '#a61d24' }}
            />
          </Space>
        </Box>
      )}
      <List
        itemLayout="horizontal"
        loading={loading}
        dataSource={sortedCombats}
        rowKey={'id'}
        renderItem={(combat) => {
          const players = combat.units.filter((c) => c.type === CombatUnitType.Player);
          const friends = _.sortBy(
            players.filter((p) => p.reaction === CombatUnitReaction.Friendly),
            ['class', 'name'],
          );
          const enemies = _.sortBy(
            players.filter((p) => p.reaction === CombatUnitReaction.Hostile),
            ['class', 'name'],
          );
          const zoneInfo = combat.startInfo ? zoneMetadata[combat.startInfo?.zoneId] : undefined;
          const duration = combat.endInfo?.matchDurationInSeconds;
          return (
            <List.Item>
              <List.Item.Meta
                title={
                  <Box display="flex" flexDirection="row" alignItems="center" justifyContent="space-between">
                    <Link href={combatUrlFactory(combat.id)}>
                      <Button type="link" className={styles['match-list-item-link']}>
                        <TimestampDisplay
                          timestamp={combat.startTime}
                          applyUtcFix={combat.utcCorrected === undefined ? applyUtcFix : !combat.utcCorrected}
                        />
                        {combat.wowVersion === 'tbc' && (
                          <Text keyboard type="secondary" style={{ marginLeft: 4 }}>
                            TBC
                          </Text>
                        )}
                        {zoneInfo && (
                          <Text keyboard type="secondary" style={{ marginLeft: 4 }}>
                            {zoneInfo.name}
                          </Text>
                        )}
                        {duration && (
                          <Text keyboard type="secondary" style={{ marginLeft: 4 }}>
                            {moment.utc(duration * 1000).format('mm:ss')}
                          </Text>
                        )}
                      </Button>
                    </Link>
                    <Box display="flex" flexDirection="row" pr={1}>
                      <Box display="flex" flexDirection="row" alignItems="center" mr={2}>
                        <Text type="secondary">{combat.playerTeamRating.toFixed()}</Text>
                        <Divider type="vertical" />
                        <Space
                          className={!viewerIsOwner && combat.result === CombatResult.Lose ? styles['winners'] : ''}
                        >
                          {enemies.map((u) => {
                            return (
                              <Box
                                key={u.id}
                                className={styles['match-list-class-color-block']}
                                style={{
                                  backgroundImage: `url(${
                                    u.spec === CombatUnitSpec.None
                                      ? Utils.getClassIcon(u.class)
                                      : Utils.getSpecIcon(u.spec as CombatUnitSpec)
                                  })`,
                                }}
                              />
                            );
                          })}
                        </Space>
                        <Divider type="vertical" />
                        <Space
                          className={!viewerIsOwner && combat.result === CombatResult.Win ? styles['winners'] : ''}
                        >
                          {friends.map((u) => {
                            return (
                              <Box
                                key={u.id}
                                className={styles['match-list-class-color-block']}
                                style={{
                                  backgroundImage: `url(${
                                    u.spec === CombatUnitSpec.None
                                      ? Utils.getClassIcon(u.class)
                                      : Utils.getSpecIcon(u.spec as CombatUnitSpec)
                                  })`,
                                }}
                              />
                            );
                          })}
                        </Space>
                      </Box>
                      {viewerIsOwner && (
                        <Tag color={combat.result === CombatResult.Win ? 'success' : 'default'}>
                          <Box style={{ minWidth: '32px', textAlign: 'center' }}>{CombatResult[combat.result]}</Box>
                        </Tag>
                      )}
                    </Box>
                  </Box>
                }
              />
            </List.Item>
          );
        }}
      />
    </Box>
  );
}
