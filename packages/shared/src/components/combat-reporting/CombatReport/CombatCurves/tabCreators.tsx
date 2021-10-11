import { Tabs } from 'antd';
import Title from 'antd/lib/typography/Title';
import { TFunction } from 'next-i18next';
import dynamic from 'next/dynamic';
import React from 'react';
import { ICombatUnit, getClassColor } from 'wow-combat-log-parser';

import { Box } from '../../../common/Box';
import { ChartablePoint } from './index';

const Line = dynamic(
  () => {
    const promise = import('@ant-design/charts').then((mod) => mod.Line);
    return promise;
  },
  { ssr: false },
);

const baseChartConfig = {
  xField: 'timeMark',
  yField: 'value',
  seriesField: 'type',
  color: ['#a61d24', '#49aa19'],
  xAxis: {
    tickCount: 10,
  },
  smooth: false,
};

interface ITabPaneProps {
  key: string;
  dataOutput: ChartablePoint[];
  dataIntake: ChartablePoint[];
  tab?: React.ReactNode;
  t: TFunction;
}

// due to how Tabs are implemented this can't be a react node
export function createPlayerTabPane({ key, dataOutput, dataIntake, tab }: ITabPaneProps) {
  return (
    <Tabs.TabPane key={key} tab={tab}>
      <Box display="flex" flexDirection="column">
        <Title level={5}>Output</Title>
        <Box height={300} mb={4}>
          <Line {...baseChartConfig} data={dataOutput} />
        </Box>
        <Title level={5}>Intake</Title>
        <Box height={300} mb={4}>
          <Line {...baseChartConfig} data={dataIntake} />
        </Box>
      </Box>
    </Tabs.TabPane>
  );
}

interface ITeamTabPaneProps extends ITabPaneProps {
  combatants: ICombatUnit[];
}

export function createTeamTabPane({ key, dataOutput, dataIntake, tab, combatants, t }: ITeamTabPaneProps) {
  const colors = combatants.map((c) => getClassColor(c.class));

  return (
    <Tabs.TabPane key={key} tab={tab}>
      <Box display="flex" flexDirection="column">
        <Title level={5}>{t('combat-report-damage-done')}</Title>
        <Box height={300} mb={4}>
          <Line {...baseChartConfig} color={colors} data={dataOutput.filter((d) => d.damageType === 'damage')} />
        </Box>
        <Title level={5}>{t('combat-report-heals-done')}</Title>
        <Box height={300} mb={4}>
          <Line {...baseChartConfig} color={colors} data={dataOutput.filter((d) => d.damageType === 'heals')} />
        </Box>
        <Title level={5}>{t('combat-report-damage-taken')}</Title>
        <Box height={300} mb={4}>
          <Line {...baseChartConfig} color={colors} data={dataIntake.filter((d) => d.damageType === 'damage')} />
        </Box>
        <Title level={5}>{t('combat-report-heals-taken')}</Title>
        <Box height={300} mb={4}>
          <Line {...baseChartConfig} color={colors} data={dataIntake.filter((d) => d.damageType === 'heals')} />
        </Box>
      </Box>
    </Tabs.TabPane>
  );
}
