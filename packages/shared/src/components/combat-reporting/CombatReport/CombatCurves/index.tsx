import { Tabs, Tag } from 'antd';
import _ from 'lodash';
import moment from 'moment';
import { useTranslation } from 'next-i18next';
import {
  CombatUnitReaction,
  CombatHpUpdateAction,
  CombatUnitType,
  CombatResult,
  ICombatData,
} from 'wow-combat-log-parser';

import { Box } from '../../../common/Box';
import { CombatUnitName } from '../CombatUnitName';
import { createPlayerTabPane, createTeamTabPane } from './tabCreators';

interface IProps {
  combat: ICombatData;
  viewerIsOwner?: boolean;
}

const CHART_TIME_INTERVAL_S = 5;

export interface ChartablePoint {
  type: string;
  direction: string;
  timestamp: number;
  timeMark: string;
  value: number;
  damageType: 'damage' | 'heals';
}

const createDataPoint = (
  type: string,
  damageType: 'damage' | 'heals',
  direction: string,
  logs: CombatHpUpdateAction[],
  timeMark: number,
  startTime: number,
): ChartablePoint => {
  return {
    type,
    direction,
    damageType,
    timestamp: timeMark,
    timeMark: moment.utc(timeMark * 1000).format('mm:ss'),
    value: _.sumBy(
      logs.filter(
        (l) =>
          l.timestamp - startTime < timeMark * 1000 &&
          l.timestamp - startTime >= (timeMark - CHART_TIME_INTERVAL_S) * 1000,
      ),
      (l) => Math.abs(l.amount),
    ),
  };
};

export function CombatCurves(props: IProps) {
  const { t } = useTranslation();
  const players = _.sortBy(
    _.values(props.combat.units).filter((u) => u.type === CombatUnitType.Player),
    ['reaction', 'name'],
  );

  const enemies = players.filter((p) => p.reaction === CombatUnitReaction.Hostile);
  const friends = players.filter((p) => p.reaction === CombatUnitReaction.Friendly);

  const enemiesData = enemies.map((u) => {
    return _.range(
      0,
      Math.ceil((props.combat.endTime - props.combat.startTime) / 1000) + CHART_TIME_INTERVAL_S,
      CHART_TIME_INTERVAL_S,
    ).flatMap((timeMark) => {
      return [
        createDataPoint(
          `${u.name} ${t('combat-report-damage-done')}`,
          'damage',
          'Output',
          u.damageOut,
          timeMark,
          props.combat.startTime,
        ),
        createDataPoint(
          `${u.name} ${t('combat-report-heals-done')}`,
          'heals',
          'Output',
          u.healOut,
          timeMark,
          props.combat.startTime,
        ),
        createDataPoint(
          `${u.name} ${t('combat-report-damage-taken')}`,
          'damage',
          'Intake',
          u.damageIn,
          timeMark,
          props.combat.startTime,
        ),
        createDataPoint(
          `${u.name} ${t('combat-report-heals-taken')}`,
          'heals',
          'Intake',
          u.healIn,
          timeMark,
          props.combat.startTime,
        ),
      ];
    });
  });
  const friendsData = friends.map((u) => {
    return _.range(
      0,
      Math.ceil((props.combat.endTime - props.combat.startTime) / 1000) + CHART_TIME_INTERVAL_S,
      CHART_TIME_INTERVAL_S,
    ).flatMap((timeMark) => {
      return [
        createDataPoint(
          `${u.name} ${t('combat-report-damage-done')}`,
          'damage',
          'Output',
          u.damageOut,
          timeMark,
          props.combat.startTime,
        ),
        createDataPoint(
          `${u.name} ${t('combat-report-heals-done')}`,
          'heals',
          'Output',
          u.healOut,
          timeMark,
          props.combat.startTime,
        ),
        createDataPoint(
          `${u.name} ${t('combat-report-damage-taken')}`,
          'damage',
          'Intake',
          u.damageIn,
          timeMark,
          props.combat.startTime,
        ),
        createDataPoint(
          `${u.name} ${t('combat-report-heals-taken')}`,
          'heals',
          'Intake',
          u.healIn,
          timeMark,
          props.combat.startTime,
        ),
      ];
    });
  });

  const team1PlayersTabs = enemies.map((u, idx) => {
    return createPlayerTabPane({
      t,
      key: u.id,
      tab: <CombatUnitName unit={u} />,
      dataOutput: enemiesData[idx].filter((r) => r.direction === 'Output'),
      dataIntake: enemiesData[idx].filter((r) => r.direction === 'Intake'),
    });
  });
  const team2PlayersTabs = friends.map((u, idx) => {
    return createPlayerTabPane({
      t,
      key: u.id,
      tab: <CombatUnitName unit={u} />,
      dataOutput: friendsData[idx].filter((r) => r.direction === 'Output'),
      dataIntake: friendsData[idx].filter((r) => r.direction === 'Intake'),
    });
  });

  const team1Tab = createTeamTabPane({
    t,
    key: 'ttab-1',
    tab: (
      <Box display="flex" flexDirection="row">
        {<Box>{props.viewerIsOwner ? t('combat-report-team-1') : t('combat-report-enemy-team')}</Box>}
        {props.combat.result === CombatResult.Lose && (
          <Box ml={2}>
            <Tag color="success">{CombatResult[CombatResult.Win]}</Tag>
          </Box>
        )}
      </Box>
    ),
    combatants: enemies,
    dataOutput: enemiesData
      .flat(1)
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((r) => r.direction === 'Output'),
    dataIntake: enemiesData
      .flat(1)
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((r) => r.direction === 'Intake'),
  });
  const team2Tab = createTeamTabPane({
    t,
    key: 'ttab-2',
    tab: (
      <Box display="flex" flexDirection="row">
        {<Box>{props.viewerIsOwner ? t('combat-report-team-2') : t('combat-report-my-team')}</Box>}
        {props.combat.result === CombatResult.Win && (
          <Box ml={2}>
            <Tag color="success">{CombatResult[CombatResult.Win]}</Tag>
          </Box>
        )}
      </Box>
    ),
    combatants: friends,
    dataOutput: friendsData
      .flat(1)
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((r) => r.direction === 'Output'),
    dataIntake: friendsData
      .flat(1)
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((r) => r.direction === 'Intake'),
  });

  return (
    <Tabs defaultActiveKey="overview" tabPosition="left">
      {team1Tab}
      {team1PlayersTabs}
      {team2Tab}
      {team2PlayersTabs}
    </Tabs>
  );
}
