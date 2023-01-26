import { AtomicArenaCombat, CombatHpUpdateAction, ICombatUnit } from '@wowarenalogs/parser';
import _ from 'lodash';
import React from 'react';
import { FaSkullCrossbones } from 'react-icons/fa';

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
        className={`flex flex-row w-16 absolute items-center ${
          secondMark === '0' ? 'justify-center' : 'justify-between'
        }`}
        style={{
          top: parseInt(secondMark, 10) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
          height: REPORT_TIMELINE_HEIGHT_PER_SECOND,
        }}
      >
        {secondMark === '0' ? (
          <div>
            <FaSkullCrossbones />
          </div>
        ) : (
          <>
            <div className="opacity-50">-{secondMark}s</div>
            <div>{hp / max >= 0.99 ? null : ((hp * 100) / max).toFixed(0) + '%'}</div>
          </>
        )}
      </div>
    );
  });
};

const generateTimeMarksColumn = (secondMarks: string[]): React.ReactElement[] => {
  return _.map(secondMarks, (secondMark) => {
    return (
      <div
        key={secondMark}
        className={`flex flex-row w-16 absolute items-center justify-center`}
        style={{
          top: parseInt(secondMark, 10) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
          height: REPORT_TIMELINE_HEIGHT_PER_SECOND,
        }}
      >
        {secondMark === '0' ? (
          <div>
            <FaSkullCrossbones />
          </div>
        ) : (
          <div className="opacity-50">-{secondMark}s</div>
        )}
      </div>
    );
  });
};

export const CombatUnitTimelineView = (props: IProps) => {
  const { combat, players } = useCombatReportContext();
  if (!combat) {
    return null;
  }

  const secondMarks = [];
  for (let i = 0; i < Math.floor((props.endTime - props.startTime) / 1000); i++) {
    secondMarks.push(i.toString());
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
    <div className="flex flex-col flex-1 text-sm">
      <div className="flex flex-row mb-1 font-bold uppercase pb-2 items-end">
        <div className="flex flex-row items-start border-t pt-2 pr-2 mr-2 border-base-content">
          {enemies.map((p) => (
            <div key={p.id} className="px-0.5" title={p.name}>
              <SpecImage specId={p.spec} size={20} />
            </div>
          ))}
          <div className="ml-1">Offense</div>
        </div>
        <div className="flex flex-col flex-1 items-end">
          <div className="text-error border-t border-base-content pt-2 pl-2">Damage Taken</div>
        </div>
        <div className="w-28 flex flex-row justify-center border-t border-base-content pt-2">
          <SpecImage specId={props.unit.spec} size={20} />
        </div>
        <div className="flex flex-col flex-1 items-start">
          <div className="text-success border-t border-base-content pt-2 pr-2">Healing Taken</div>
        </div>
        <div className="flex flex-row items-start border-t pt-2 pl-2 ml-2 border-base-content">
          <div className="mr-1">Defense</div>
          {friends.map((p) => (
            <div key={p.id} className="px-0.5" title={p.name}>
              <SpecImage specId={p.spec} size={20} />
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
        <div
          className="w-16 flex relative"
          style={{
            height: ((props.endTime - props.startTime) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
          }}
        >
          {combat.hasAdvancedLogging
            ? generateHpColumn(props.unit, hpBySecondMark)
            : generateTimeMarksColumn(secondMarks)}
        </div>
        <div className="divider divider-horizontal mx-1" />
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
  );
};
