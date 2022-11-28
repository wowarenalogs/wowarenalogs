import { AtomicArenaCombat, CombatHpUpdateAction, ICombatUnit } from '@wowarenalogs/parser';
import _ from 'lodash';
import React from 'react';

import { useCombatReportContext } from './CombatReportContext';
import { CombatUnitHpUpdate } from './CombatUnitHpUpdate';

interface IProps {
  unit: ICombatUnit;
  startTime: number;
  endTime: number;
}

const REPORT_TIMELINE_HEIGHT_PER_SECOND = 24;

const generateHpUpdateColumn = (
  combat: AtomicArenaCombat,
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
        className="flex flex-row absolute"
        style={{
          top: parseInt(secondMark, 10) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
          left: align === 'LEFT' ? 0 : undefined,
          right: align === 'RIGHT' ? 0 : undefined,
          width: ((groupTotal / maxAbs) * 90).toFixed(2) + '%',
          minWidth: '4px',
          height: REPORT_TIMELINE_HEIGHT_PER_SECOND,
        }}
      >
        {group.map((action) => (
          <CombatUnitHpUpdate
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

export const CombatUnitTimelineView = (props: IProps) => {
  const { combat } = useCombatReportContext();
  if (!combat) {
    return null;
  }

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
    <div className="flex flex-row">
      <div className="flex flex-col justify-between">
        {timeMarks.map((t, _i) => (
          <div key={t} className="opacity-60">
            t-{Math.round((props.endTime - t) / 1000).toFixed()}s
          </div>
        ))}
      </div>
      <div className="flex flex-col flex-1">
        <div className="flex flex-row mb-1">
          <div className="flex flex-col flex-1 items-center">
            <div className="text-error">Damage Taken</div>
          </div>
          <div className="flex flex-col flex-1 items-center">
            <div className="text-success">Healing Taken</div>
          </div>
        </div>
        <div className="flex flex-row">
          <div
            className="flex flex-col flex-1 relative"
            style={{
              height: ((props.endTime - props.startTime) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
            }}
          >
            {generateHpUpdateColumn(combat, props.unit, damageActionGroupsBySecondMark, 'RIGHT', maxAbs)}
          </div>
          <div
            className="divider divider-horizontal"
            style={{
              height: ((props.endTime - props.startTime) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
            }}
          />
          <div
            className="flex flex-col flex-1 relative"
            style={{
              height: ((props.endTime - props.startTime) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
            }}
          >
            {generateHpUpdateColumn(combat, props.unit, healActionGroupsBySecondMark, 'LEFT', maxAbs)}
          </div>
        </div>
      </div>
    </div>
  );
};
