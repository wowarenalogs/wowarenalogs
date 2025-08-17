import { AtomicArenaCombat, CombatHpUpdateAction, ICombatUnit } from '@wowarenalogs/parser';
import _ from 'lodash';
import moment from 'moment';
import React, { useEffect, useState } from 'react';
import { FaSkullCrossbones } from 'react-icons/fa';

import { Utils } from '../../../utils/utils';
import { SpecImage } from '../../common/SpecImage';
import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitAuraTimeline } from './CombatUnitAuraTimeline';
import { CombatUnitHpUpdate } from './CombatUnitHpUpdate';
import { REPORT_TIMELINE_HEIGHT_PER_SECOND } from './common';

interface IProps {
  unit: ICombatUnit;
  startTime: number;
  endTime: number;
  onlyShowCC?: boolean;
}

const generateHpUpdateColumn = (
  combat: AtomicArenaCombat,
  unit: ICombatUnit,
  actionGroupsBySecondMark: _.Dictionary<CombatHpUpdateAction[]>,
  align: 'LEFT' | 'RIGHT',
  maxAbs: number,
  startTime: number,
  endTime: number,
  deathTime: number,
): React.ReactNode => {
  return (
    <div
      className={`flex flex-1 ${align === 'LEFT' ? 'flex-row' : 'flex-row-reverse'}`}
      style={{
        height: ((endTime - startTime) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
      }}
    >
      <div className="relative w-12 ml-1">
        {_.map(actionGroupsBySecondMark, (group, secondMark) => {
          const groupTotal = _.sumBy(group, (action) => action.effectiveAmount);
          return (
            <div
              key={secondMark}
              className={`flex w-full flex-row text-xs absolute items-center ${
                align === 'LEFT' ? 'justify-start' : 'justify-end'
              } ${groupTotal >= 0 ? 'text-success' : 'text-error'}`}
              style={{
                top:
                  (parseInt(secondMark, 10) - Math.floor((deathTime - endTime) / 1000)) *
                  REPORT_TIMELINE_HEIGHT_PER_SECOND,
                height: REPORT_TIMELINE_HEIGHT_PER_SECOND,
              }}
            >
              {groupTotal ? Utils.printCombatNumber(Math.abs(groupTotal * 10000)) : null}
            </div>
          );
        })}
      </div>
      <div className="flex-1 relative">
        {_.map(actionGroupsBySecondMark, (group, secondMark) => {
          const groupTotal = _.sumBy(group, (action) => Math.abs(action.effectiveAmount));
          const actionGroups = _.groupBy(group, (action) =>
            JSON.stringify({
              srcUnitId: action.srcUnitId,
              destUnitId: action.destUnitId,
              spellId: action.spellId,
              spellName: action.spellName,
            }),
          );
          return (
            <div
              key={secondMark}
              className={`flex ${align === 'LEFT' ? 'flex-row' : 'flex-row-reverse'} absolute`}
              style={{
                top:
                  (parseInt(secondMark, 10) - Math.floor((deathTime - endTime) / 1000)) *
                  REPORT_TIMELINE_HEIGHT_PER_SECOND,
                left: align === 'LEFT' ? 0 : undefined,
                right: align === 'RIGHT' ? 0 : undefined,
                width: ((groupTotal / maxAbs) * 90).toFixed(2) + '%',
                minWidth: '4px',
                height: REPORT_TIMELINE_HEIGHT_PER_SECOND,
              }}
            >
              {_.map(actionGroups, (actions, key) => (
                <CombatUnitHpUpdate
                  key={key}
                  actionGroup={{
                    ...JSON.parse(key),
                    actions,
                  }}
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

const generateHpColumn = (
  unit: ICombatUnit,
  hpBySecondMark: _.Dictionary<number>,
  endTime: number,
  deathTime: number,
): React.ReactElement[] => {
  const max = _.max(unit.advancedActions.map((a) => a.advancedActorMaxHp)) ?? 1;
  return _.map(hpBySecondMark, (hp, secondMark) => {
    const absoluteTime = deathTime - parseInt(secondMark) * 1000;
    return (
      <div
        key={secondMark}
        className={`flex flex-row w-16 absolute items-center ${
          secondMark === '0' ? 'justify-center' : 'justify-between'
        }`}
        style={{
          top:
            (parseInt(secondMark, 10) - Math.floor((deathTime - endTime) / 1000)) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
          height: REPORT_TIMELINE_HEIGHT_PER_SECOND,
        }}
      >
        {secondMark === '0' ? (
          <div>
            <FaSkullCrossbones />
          </div>
        ) : (
          <>
            <div className="tooltip tooltip-left" data-tip={moment.utc(absoluteTime).format('mm:ss')}>
              <div className="opacity-50">-{secondMark}s</div>
            </div>
            <div>{hp / max >= 0.99 ? null : ((hp * 100) / max).toFixed(0) + '%'}</div>
          </>
        )}
      </div>
    );
  });
};

const generateTimeMarksColumn = (
  startTime: number,
  endTime: number,
  combatStartTime: number,
  deathTime: number,
): React.ReactElement[] => {
  const secondMarks = [];
  for (let i = 0; i <= (endTime - startTime) / 1000; i++) {
    secondMarks.push(i + Math.floor((deathTime - endTime) / 1000));
  }
  return _.map(secondMarks, (secondMark) => {
    const absoluteTime = combatStartTime + deathTime - secondMark * 1000;
    return (
      <div
        key={secondMark}
        className={`flex flex-row w-16 absolute items-center justify-center`}
        style={{
          top: (secondMark - Math.floor((deathTime - endTime) / 1000)) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
          height: REPORT_TIMELINE_HEIGHT_PER_SECOND,
        }}
      >
        {secondMark <= 0 ? (
          <div>
            <FaSkullCrossbones />
          </div>
        ) : (
          <div className="opacity-50" title={moment.utc(absoluteTime).format('mm:ss')}>
            -{secondMark}s
          </div>
        )}
      </div>
    );
  });
};

export const CombatUnitTimelineView = (props: IProps) => {
  const [endTime, setEndTime] = useState(props.endTime);
  const viewportDuration = props.endTime - props.startTime;
  const deathTime = props.endTime;
  const startTime = endTime - viewportDuration;

  useEffect(() => {
    setEndTime(props.endTime);
  }, [props.endTime]);

  const { combat, players } = useCombatReportContext();
  if (!combat) {
    return null;
  }

  // Group damage/healing actions and hp numbers into 1 second chunks
  const damageActions = props.unit.damageIn.filter((a) => a.timestamp >= startTime && a.timestamp <= endTime);
  const damageActionGroupsBySecondMark = _.groupBy(damageActions, (action) =>
    Math.floor((deathTime - action.timestamp) / 1000),
  );
  const healActions = props.unit.healIn.filter((a) => a.timestamp >= startTime && a.timestamp <= endTime);
  const healActionGroupsBySecondMark = _.groupBy(healActions, (action) =>
    Math.floor((deathTime - action.timestamp) / 1000),
  );

  const advancedActions = props.unit.advancedActions.filter((a) => a.timestamp >= startTime && a.timestamp <= endTime);
  const hpBySecondMark = _.mapValues(
    _.groupBy(advancedActions, (action) => Math.floor((deathTime - action.timestamp) / 1000)),
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

  const sliderStartOffset = (deathTime - combat.startTime) % 1000;

  return (
    <div className="flex flex-col flex-1 text-sm">
      <div className="flex flex-row items-center mb-2">
        <input
          type="range"
          className="range range-sm flex-1"
          min={0}
          max={deathTime - combat.startTime - sliderStartOffset}
          value={endTime - combat.startTime - sliderStartOffset}
          step={1000}
          onChange={(e) => {
            setEndTime(e.target.valueAsNumber + combat.startTime + sliderStartOffset);
          }}
        />
        <div className="ml-2">{moment.utc(endTime - combat.startTime).format('mm:ss')}</div>
        <div className="opacity-50 mr-2">
          &nbsp;
          {'/ ' + moment.utc(deathTime - combat.startTime).format('mm:ss')}
        </div>
        <FaSkullCrossbones className="opacity-50" />
      </div>
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
          <CombatUnitAuraTimeline
            key={p.id}
            unit={p}
            startTime={startTime}
            endTime={endTime}
            onlyShowCC={props.onlyShowCC}
          />
        ))}
        {generateHpUpdateColumn(
          combat,
          props.unit,
          damageActionGroupsBySecondMark,
          'RIGHT',
          maxAbs,
          startTime,
          endTime,
          deathTime,
        )}
        <div className="divider divider-horizontal mx-0" />
        <div
          className="w-16 flex relative"
          style={{
            height: (viewportDuration / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
          }}
        >
          {combat.hasAdvancedLogging
            ? generateHpColumn(props.unit, hpBySecondMark, endTime, deathTime)
            : generateTimeMarksColumn(startTime, endTime, combat.startTime, deathTime)}
        </div>
        <div className="divider divider-horizontal mx-0" />
        {generateHpUpdateColumn(
          combat,
          props.unit,
          healActionGroupsBySecondMark,
          'LEFT',
          maxAbs,
          startTime,
          endTime,
          deathTime,
        )}
        {friends.map((p) => (
          <CombatUnitAuraTimeline
            key={p.id}
            unit={p}
            startTime={startTime}
            endTime={endTime}
            onlyShowCC={props.onlyShowCC}
          />
        ))}
      </div>
    </div>
  );
};
