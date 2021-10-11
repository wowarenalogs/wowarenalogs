import { Divider } from 'antd';
import Text from 'antd/lib/typography/Text';
import _ from 'lodash';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { ICombatData, ICombatUnit } from 'wow-combat-log-parser';
import { CombatHpUpdateAction } from 'wow-combat-log-parser';

import { Box } from '../../../common/Box';
import { CombatReportHpUpdate } from '../CombatLogHpUpdate';

interface IProps {
  combat: ICombatData;
  unit: ICombatUnit;
  startTime: number;
  endTime: number;
}

const REPORT_TIMELINE_HEIGHT_PER_SECOND = 24;

const generateHpUpdateColumn = (
  combat: ICombatData,
  unit: ICombatUnit,
  actionGroupsBySecondMark: _.Dictionary<CombatHpUpdateAction[]>,
  align: 'LEFT' | 'RIGHT',
  maxAbs: number,
): React.ReactElement[] => {
  return _.map(actionGroupsBySecondMark, (group, secondMark) => {
    const groupTotal = _.sumBy(group, (action) => Math.abs(action.amount));
    return (
      <div
        key={secondMark}
        style={{
          position: 'absolute',
          top: parseInt(secondMark, 10) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
          left: align === 'LEFT' ? 0 : undefined,
          right: align === 'RIGHT' ? 0 : undefined,
          width: ((groupTotal / maxAbs) * 90).toFixed(2) + '%',
          minWidth: '4px',
          height: REPORT_TIMELINE_HEIGHT_PER_SECOND,
          display: 'flex',
        }}
      >
        {group.map((action) => (
          <CombatReportHpUpdate
            key={action.logLine.id}
            action={action}
            unit={unit}
            combat={combat}
            groupTotal={groupTotal}
            timelineMax={maxAbs}
          />
        ))}
      </div>
    );
  });
};

export function CombatUnitTimelineView(props: IProps) {
  const { t } = useTranslation();

  const timeMarkCount = Math.round((props.endTime - props.startTime) / 5000);
  const timeMarks = [];
  let currentMark = props.endTime;
  while (currentMark >= props.startTime) {
    timeMarks.push(currentMark);
    currentMark -= (props.endTime - props.startTime) / timeMarkCount;
  }

  // Group damage and healing actions into 1 second chunks
  const damageActions = props.unit.damageIn.filter(
    (a) => a.timestamp >= props.startTime && a.timestamp <= props.endTime,
  );
  const damageActionGroupsBySecondMark = _.groupBy(damageActions, (action) =>
    Math.floor((props.endTime - action.timestamp) / 1000),
  );
  const healActions = props.unit.healIn.filter((a) => a.timestamp >= props.startTime && a.timestamp <= props.endTime);
  const healActionGroupsBySecondMark = _.groupBy(healActions, (action) =>
    Math.floor((props.endTime - action.timestamp) / 1000),
  );

  // Scale horizontal values such that 100% width maps to the highest per-row total
  const maxAbsDamage =
    _.max(_.values(damageActionGroupsBySecondMark).map((ar) => _.sum(ar.map((e) => Math.abs(e.amount))))) || 1;
  const maxAbsHeal =
    _.max(_.values(damageActionGroupsBySecondMark).map((ar) => _.sum(ar.map((e) => Math.abs(e.amount))))) || 1;
  const maxAbs = Math.max(maxAbsDamage, maxAbsHeal);

  return (
    <Box display="flex" flexDirection="row">
      <Box display="flex" flexDirection="column" justifyContent="space-between">
        {timeMarks.map((t, i) => (
          <Text key={t} type="secondary">
            t-{Math.round((props.endTime - t) / 1000).toFixed()}s
          </Text>
        ))}
      </Box>
      <Box flex={1} display="flex" flexDirection="column">
        <Box display="flex" flexDirection="row" mb={1}>
          <Box display="flex" flexDirection="column" flex={1} alignItems="center">
            <Text type="danger">{t('combat-report-damage-taken')}</Text>
          </Box>
          <Box display="flex" flexDirection="column" flex={1} alignItems="center">
            <Text type="success">{t('combat-report-heals-taken')}</Text>
          </Box>
        </Box>
        <Box display="flex" flexDirection="row">
          <Box
            display="flex"
            flexDirection="column"
            flex={1}
            style={{
              position: 'relative',
              height: ((props.endTime - props.startTime) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
            }}
          >
            {generateHpUpdateColumn(props.combat, props.unit, damageActionGroupsBySecondMark, 'RIGHT', maxAbs)}
          </Box>
          <Divider
            type="vertical"
            style={{
              height: ((props.endTime - props.startTime) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
            }}
          />
          <Box
            display="flex"
            flexDirection="column"
            flex={1}
            style={{
              position: 'relative',
              height: ((props.endTime - props.startTime) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
            }}
          >
            {generateHpUpdateColumn(props.combat, props.unit, healActionGroupsBySecondMark, 'LEFT', maxAbs)}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
