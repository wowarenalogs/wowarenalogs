import { Tabs } from 'antd';
import Text from 'antd/lib/typography/Text';
import _ from 'lodash';
import moment from 'moment';
import { ICombatUnit, CombatUnitType, ILogLine, ICombatData } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { Box } from '../../../common/Box';
import { CombatUnitName } from '../CombatUnitName';
import { CombatUnitTimelineView } from '../CombatUnitTimelineView';

interface IProps {
  combat: ICombatData;
}

interface IPlayerDeath {
  unit: ICombatUnit;
  deathRecord: ILogLine;
}

function printDeathID(death: IPlayerDeath | null) {
  if (death === null) {
    return '';
  }
  return `${death.unit.id}_${death.deathRecord.timestamp.toFixed()}`;
}

export function DeathReports(props: IProps) {
  const players = _.values(props.combat.units).filter((u) => u.type === CombatUnitType.Player);

  const allPlayerDeath = _.sortBy(
    _.flatMap(players, (p) => {
      return p.deathRecords.map((r) => {
        return {
          unit: p,
          deathRecord: r,
        };
      });
    }),
    (r) => r.deathRecord.timestamp,
  );

  return (
    <Tabs defaultActiveKey={printDeathID(allPlayerDeath.length > 0 ? allPlayerDeath[0] : null)} tabPosition="left">
      {allPlayerDeath.map((d) => {
        const time = moment.utc(moment(d.deathRecord.timestamp).diff(moment(props.combat.startTime))).format('mm:ss');
        return (
          <Tabs.TabPane
            key={printDeathID(d)}
            tab={
              <Box
                className={styles['death-reports-unit-label']}
                display="flex"
                flexDirection="column"
                alignItems="center"
              >
                <CombatUnitName unit={d.unit} />
                <Text type="secondary">{time}</Text>
              </Box>
            }
          >
            <CombatUnitTimelineView
              combat={props.combat}
              unit={d.unit}
              startTime={d.deathRecord.timestamp - 30 * 1000}
              endTime={d.deathRecord.timestamp}
            />
          </Tabs.TabPane>
        );
      })}
    </Tabs>
  );
}
