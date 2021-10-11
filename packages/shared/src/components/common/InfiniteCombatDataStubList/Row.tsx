/* eslint-disable jsx-a11y/anchor-is-valid */
import { Divider, List, Space, Tag } from 'antd';
import Text from 'antd/lib/typography/Text';
import _ from 'lodash';
import moment from 'moment';
import Link from 'next/link';
import React from 'react';
import { CombatResult, CombatUnitReaction, CombatUnitSpec, CombatUnitType } from 'wow-combat-log-parser';

import styles from './Row.module.css';

import { CombatDataStub } from '../../../graphql/__generated__/graphql';
import { Utils } from '../../../utils';
import { zoneMetadata } from '../../../utils/zoneMetadata';
import { Box } from '../Box';
import { TimestampDisplay } from '../TimestampDisplay';

interface IProps {
  combat: CombatDataStub;
  combatUrlFactory: (id: string) => string;
  applyUtcFix: boolean;
  viewerIsOwner: boolean;
  style: React.CSSProperties;
}
export function Row(props: IProps) {
  const combat = props.combat;

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
    <List.Item style={props.style}>
      <List.Item.Meta
        title={
          <Box display="flex" flexDirection="row" alignItems="center" justifyContent="space-between">
            <Link passHref href={props.combatUrlFactory(combat.id)}>
              <a className={styles['match-list-item-link']}>
                <TimestampDisplay
                  timestamp={combat.startTime}
                  applyUtcFix={combat.utcCorrected === undefined ? props.applyUtcFix : !combat.utcCorrected}
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
              </a>
            </Link>
            <Box display="flex" flexDirection="row" pr={1}>
              <Box display="flex" flexDirection="row" alignItems="center" mr={2}>
                <Text type="secondary">{combat.playerTeamRating.toFixed()}</Text>
                <Divider type="vertical" />
                <Space className={!props.viewerIsOwner && combat.result === CombatResult.Lose ? styles['winners'] : ''}>
                  {enemies.map((u) => {
                    return (
                      <Box
                        key={u.id + u.spec}
                        className={styles['match-list-class-color-block']}
                        style={{
                          backgroundImage:
                            u.spec === CombatUnitSpec.None
                              ? `url(${Utils.getClassIcon(u.class)})`
                              : `url(${Utils.getSpecIcon(u.spec as CombatUnitSpec)})`,
                        }}
                      />
                    );
                  })}
                </Space>
                <Divider type="vertical" />
                <Space className={!props.viewerIsOwner && combat.result === CombatResult.Win ? styles['winners'] : ''}>
                  {friends.map((u) => {
                    return (
                      <Box
                        key={u.id + u.spec}
                        className={styles['match-list-class-color-block']}
                        style={{
                          backgroundImage:
                            u.spec === CombatUnitSpec.None
                              ? `url(${Utils.getClassIcon(u.class)})`
                              : `url(${Utils.getSpecIcon(u.spec as CombatUnitSpec)})`,
                        }}
                      />
                    );
                  })}
                </Space>
              </Box>
              {props.viewerIsOwner && (
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
}
