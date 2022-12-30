import { CombatUnitSpec, getClassColor, ICombatUnit } from '@wowarenalogs/parser';
import Image from 'next/image';

import { Utils } from '../../utils/utils';
import { useCombatReportContext } from './CombatReportContext';

interface IProps {
  unit: ICombatUnit;
  navigateToPlayerView?: boolean;
  isTitle?: boolean;
  onClick?: () => void;
  showSpec?: boolean;
}

export const CombatUnitName = ({ unit, navigateToPlayerView, isTitle, onClick, showSpec = true }: IProps) => {
  const combatReportContext = useCombatReportContext();

  return (
    <div
      className={`flex flex-row items-center ${isTitle ? '' : 'flex-1'}`}
      onClick={() => {
        if (navigateToPlayerView) {
          combatReportContext.navigateToPlayerView(unit.id);
        }
        if (onClick) {
          onClick();
        }
      }}
      style={{
        cursor: navigateToPlayerView ? 'pointer' : undefined,
      }}
    >
      {showSpec && (
        <div className={`mr-1 ${isTitle ? 'w-9 h-9' : 'w-5 h-5'}`}>
          <Image
            className="rounded"
            src={
              (unit.spec === CombatUnitSpec.None ? Utils.getClassIcon(unit.class) : Utils.getSpecIcon(unit.spec)) ??
              'https://images.wowarenalogs.com/spells/0.jpg'
            }
            alt={unit.spec === CombatUnitSpec.None ? Utils.getClassName(unit.class) : Utils.getSpecName(unit.spec)}
            width={isTitle ? 36 : 20}
            height={isTitle ? 36 : 20}
          />
        </div>
      )}
      <span
        className={`font-bold flex-1 text-ellipsis overflow-hidden whitespace-nowrap ${isTitle ? 'text-2xl' : ''}`}
        style={{ color: getClassColor(unit.class), maxWidth: isTitle ? 'unset' : 110 }}
      >
        {unit.name.split('-')[0]}
      </span>
    </div>
  );
};
