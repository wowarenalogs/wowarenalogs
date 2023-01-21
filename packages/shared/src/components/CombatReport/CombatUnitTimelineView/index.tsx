import { AtomicArenaCombat, CombatHpUpdateAction, ICombatUnit } from '@wowarenalogs/parser';
import _ from 'lodash';
import React from 'react';

import { SIGNIFICANT_DAMAGE_HEAL_THRESHOLD, Utils } from '../../../utils/utils';
import { SpecImage } from '../../common/SpecImage';
import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitAuraTimeline } from './CombatUnitAuraTimeline';
import { CombatUnitHpUpdate } from './CombatUnitHpUpdate';
import { REPORT_TIMELINE_HEIGHT_PER_SECOND } from './common';

interface IProps {
  unit: ICombatUnit;
  startTime: number;
  endTime: number;
}

const generateHpUpdateColumn = (
  combat: AtomicArenaCombat,
  unit: ICombatUnit,
  actionGroupsBySecondMark: _.Dictionary<CombatHpUpdateAction[]>,
  align: 'LEFT' | 'RIGHT',
  maxAbs: number,
  startTime: number,
  endTime: number,
): React.ReactNode => {
  return (
    <div
      className={`flex flex-1 ${align === 'LEFT' ? 'flex-row' : 'flex-row-reverse'}`}
      style={{
        height: ((endTime - startTime) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
      }}
    >
      <div className="relative w-8">
        {_.map(actionGroupsBySecondMark, (group, secondMark) => {
          const groupTotal = _.sumBy(group, (action) => action.effectiveAmount);
          return (
            <div
              key={secondMark}
              className={`flex flex-row text-xs w-8 absolute items-center ${
                align === 'LEFT' ? 'justify-start' : 'justify-end'
              } ${groupTotal >= 0 ? 'text-success' : 'text-error'}`}
              style={{
                top: parseInt(secondMark, 10) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
                height: REPORT_TIMELINE_HEIGHT_PER_SECOND,
              }}
            >
              {Math.abs(groupTotal) >= SIGNIFICANT_DAMAGE_HEAL_THRESHOLD
                ? Utils.printCombatNumber(Math.abs(groupTotal))
                : null}
            </div>
          );
        })}
      </div>
      <div className="flex-1 relative">
        {_.map(actionGroupsBySecondMark, (group, secondMark) => {
          const groupTotal = _.sumBy(group, (action) => Math.abs(action.effectiveAmount));
          return (
            <div
              key={secondMark}
              className={`flex ${align === 'LEFT' ? 'flex-row' : 'flex-row-reverse'} absolute`}
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
        })}
      </div>
    </div>
  );
};

const generateHpColumn = (unit: ICombatUnit, hpBySecondMark: _.Dictionary<number>): React.ReactElement[] => {
  const max = _.max(unit.advancedActions.map((a) => a.advancedActorMaxHp)) ?? 1;
  return _.map(hpBySecondMark, (hp, secondMark) => {
    return (
      <div
        key={secondMark}
        className="flex flex-row w-8 absolute justify-center items-center"
        style={{
          top: parseInt(secondMark, 10) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
          height: REPORT_TIMELINE_HEIGHT_PER_SECOND,
        }}
      >
        {hp / max >= 0.99 ? null : ((hp * 100) / max).toFixed(0) + '%'}
      </div>
    );
  });
};
export const CombatUnitTimelineView = (props: IProps) => {
  const { combat, players } = useCombatReportContext();
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

  // Group damage/healing actions and hp numbers into 1 second chunks
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

  const advancedActions = props.unit.advancedActions.filter(
    (a) => a.timestamp >= props.startTime && a.timestamp <= props.endTime,
  );
  const hpBySecondMark = _.mapValues(
    _.groupBy(advancedActions, (action) => Math.floor((props.endTime - action.timestamp) / 1000)),
    (actions) => _.maxBy(actions, (a) => a.timestamp)?.advancedActorCurrentHp ?? 0,
  );

  // Scale horizontal values such that 100% width maps to the highest per-row total
  const maxAbsDamage =
    _.max(_.values(damageActionGroupsBySecondMark).map((ar) => _.sum(ar.map((e) => Math.abs(e.effectiveAmount))))) || 1;
  const maxAbsHeal =
    _.max(_.values(healActionGroupsBySecondMark).map((ar) => _.sum(ar.map((e) => Math.abs(e.effectiveAmount))))) || 1;
  const maxAbs = Math.max(maxAbsDamage, maxAbsHeal);

  const friends = players.filter((p) => p.reaction === props.unit.reaction);
  const enemies = players.filter((p) => p.reaction !== props.unit.reaction);

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
          <div className="flex flex-row items-center border-t-2 border-base-content">
            {enemies.map((p) => (
              <div key={p.id} className="pt-1 px-1" title={p.name}>
                <SpecImage specId={p.spec} size={16} />
              </div>
            ))}
          </div>
          <div className="flex flex-col flex-1 items-center">
            <div className="text-error">Damage Taken</div>
          </div>
          {combat.hasAdvancedLogging ? <div className="w-8 flex flex-row justify-center">HP</div> : null}
          <div className="flex flex-col flex-1 items-center">
            <div className="text-success">Healing Taken</div>
          </div>
          <div className="flex flex-row items-center border-t-2 border-base-content">
            {friends.map((p) => (
              <div key={p.id} className="pt-1 px-1" title={p.name}>
                <SpecImage specId={p.spec} size={16} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-row">
          {enemies.map((p) => (
            <CombatUnitAuraTimeline key={p.id} unit={p} startTime={props.startTime} endTime={props.endTime} />
          ))}
          {generateHpUpdateColumn(
            combat,
            props.unit,
            damageActionGroupsBySecondMark,
            'RIGHT',
            maxAbs,
            props.startTime,
            props.endTime,
          )}
          <div className="divider divider-horizontal mx-1" />
          {combat.hasAdvancedLogging ? (
            <>
              <div
                className="w-8 flex relative"
                style={{
                  height: ((props.endTime - props.startTime) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
                }}
              >
                {generateHpColumn(props.unit, hpBySecondMark)}
              </div>
              <div className="divider divider-horizontal mx-1" />
            </>
          ) : null}
          {generateHpUpdateColumn(
            combat,
            props.unit,
            healActionGroupsBySecondMark,
            'LEFT',
            maxAbs,
            props.startTime,
            props.endTime,
          )}
          {friends.map((p) => (
            <CombatUnitAuraTimeline key={p.id} unit={p} startTime={props.startTime} endTime={props.endTime} />
          ))}
        </div>
      </div>
    </div>
  );
};
