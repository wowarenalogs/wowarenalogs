import {
  AtomicArenaCombat,
  CombatHpUpdateAction,
  CombatUnitClass,
  getClassColor,
  ICombatUnit,
} from '@wowarenalogs/parser';
import Image from 'next/image';

import { Utils } from '../../../utils/utils';

interface IProps {
  action: CombatHpUpdateAction;
  unit: ICombatUnit;
  combat: AtomicArenaCombat;
  groupTotal: number;
  timelineMax: number;
}

export const CombatUnitHpUpdate = (props: IProps) => {
  const colorSourceUnitId =
    props.action.destUnitId === props.unit.id ? props.action.srcUnitId : props.action.destUnitId;
  const colorSourceUnit = props.combat.units[colorSourceUnitId];
  const colorSourceUnitClass = colorSourceUnit ? colorSourceUnit.class : CombatUnitClass.None;

  const widthPercentage = (Math.abs(props.action.effectiveAmount) / props.groupTotal) * 100;
  const widthPercentageAbsolute = (Math.abs(props.action.effectiveAmount) / props.timelineMax) * 100;

  return (
    <div
      className="tooltip flex flex-row"
      data-tip={`${props.action.spellName || 'Auto Attack'}: ${Utils.printCombatNumber(
        Math.abs(props.action.effectiveAmount),
        props.action.isCritical,
      )}`}
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
        {widthPercentageAbsolute >= 10 && props.action.spellId ? (
          <div className="ml-1 w-4 h-4" style={{ minWidth: 16, minHeight: 16 }}>
            <Image
              className="rounded"
              src={Utils.getSpellIcon(props.action.spellId) ?? 'https://images.wowarenalogs.com/spells/0.jpg'}
              width={16}
              height={16}
              alt={props.action.spellName ?? ''}
            />
          </div>
        ) : null}
        {widthPercentageAbsolute >= 30 && props.action.spellId ? (
          <div className="ml-1 text-black font-medium text-xs">
            {Utils.printCombatNumber(Math.abs(props.action.effectiveAmount), props.action.isCritical)}
          </div>
        ) : null}
      </div>
    </div>
  );
};
