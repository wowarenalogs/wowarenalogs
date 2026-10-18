import { AtomicArenaCombat, CombatUnitClass, getClassColor, ICombatUnit, IOutputCredit } from '@wowarenalogs/parser';
import _ from 'lodash';
import Image from 'next/image';
import { useMemo } from 'react';

import { Utils } from '../../../utils/utils';

interface IProps {
  actionGroup: {
    srcUnitId: string;
    destUnitId: string;
    spellId: string;
    spellName: string;
    actions: IOutputCredit[];
  };
  unit: ICombatUnit;
  combat: AtomicArenaCombat;
  groupTotal: number;
  timelineMax: number;
}

const isCritical = (a: IOutputCredit) => 'isCritical' in a.action && a.action.isCritical;

export const CombatUnitHpUpdate = (props: IProps) => {
  const colorSourceUnitId =
    props.actionGroup.destUnitId === props.unit.id ? props.actionGroup.srcUnitId : props.actionGroup.destUnitId;

  let colorSourceUnit = props.combat.units[colorSourceUnitId];
  if (colorSourceUnit.ownerId !== '0') {
    colorSourceUnit = props.combat.units[colorSourceUnit.ownerId];
  }

  const colorSourceUnitClass = colorSourceUnit ? colorSourceUnit.class : CombatUnitClass.None;
  const totalEffectiveAmount = useMemo(
    () => _.sum(props.actionGroup.actions.map((a) => a.effectiveAmount)),
    [props.actionGroup.actions],
  );
  const hits = useMemo(() => props.actionGroup.actions.filter((a) => !a.isAdjustment), [props.actionGroup.actions]);
  const isAllCrit = useMemo(() => hits.every(isCritical), [hits]);
  const tooltip = useMemo(() => {
    const spellName = props.actionGroup.spellName || 'Auto Attack';
    if (hits.length === 1) {
      return `${spellName}: ${Utils.printCombatNumber(Math.abs(totalEffectiveAmount), isAllCrit)}`;
    }

    const normalHits = hits.filter((a) => !isCritical(a));
    const critHits = hits.filter(isCritical);

    const normalHitsText =
      normalHits.length > 0
        ? `

${normalHits.length} normal hits, total = ${Utils.printCombatNumber(
            _.sum(normalHits.map((a) => Math.abs(a.effectiveAmount))),
          )}, max = ${Utils.printCombatNumber(
            Math.abs(_.maxBy(normalHits, (h) => Math.abs(h.effectiveAmount))?.effectiveAmount ?? 0),
          )}`
        : '';

    const critHitsText =
      critHits.length > 0
        ? `

${critHits.length} crit hits, total = ${Utils.printCombatNumber(
            _.sum(critHits.map((a) => Math.abs(a.effectiveAmount))),
          )}, max = ${Utils.printCombatNumber(
            Math.abs(_.maxBy(critHits, (h) => Math.abs(h.effectiveAmount))?.effectiveAmount ?? 0),
          )}`
        : '';

    return `${spellName}: ${Utils.printCombatNumber(
      Math.abs(totalEffectiveAmount),
      false,
    )}${normalHitsText}${critHitsText}`;
  }, [hits, props.actionGroup.spellName, totalEffectiveAmount, isAllCrit]);

  const widthPercentage = (Math.abs(totalEffectiveAmount) / props.groupTotal) * 100;
  const widthPercentageAbsolute = (Math.abs(totalEffectiveAmount) / props.timelineMax) * 100;

  return (
    <div
      className="tooltip flex flex-row whitespace-pre-line text-left z-50"
      data-tip={tooltip}
      style={{
        minWidth: '4px',
        width: widthPercentage.toFixed(2) + '%',
      }}
    >
      <div
        className="border border-solid border-black hover:border-base-content flex-1 flex flex-row items-center relative overflow-hidden"
        style={{
          backgroundColor: getClassColor(colorSourceUnitClass),
        }}
      >
        {widthPercentageAbsolute >= 10 && props.actionGroup.spellId ? (
          <div className="ml-1 w-4 h-4" style={{ minWidth: 16, minHeight: 16 }}>
            <Image
              className="rounded"
              src={Utils.getSpellIcon(props.actionGroup.spellId) ?? 'https://images.wowarenalogs.com/spells/0.jpg'}
              width={16}
              height={16}
              alt={props.actionGroup.spellName ?? ''}
            />
          </div>
        ) : null}
        {widthPercentageAbsolute >= 30 && props.actionGroup.spellId ? (
          <div className="ml-1 text-black font-medium text-xs">
            {Utils.printCombatNumber(Math.abs(totalEffectiveAmount), isAllCrit)}
          </div>
        ) : null}
      </div>
    </div>
  );
};
