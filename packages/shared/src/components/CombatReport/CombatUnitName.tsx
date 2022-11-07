import { CombatUnitSpec, getClassColor, ICombatUnit } from '@wowarenalogs/parser';

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
        <div
          className={`mr-1 rounded bg-contain ${isTitle ? 'w-9 h-9' : 'w-5 h-5'}`}
          style={{
            backgroundImage:
              unit.spec === CombatUnitSpec.None
                ? `url(${Utils.getClassIcon(unit.class)})`
                : `url(${Utils.getSpecIcon(unit.spec)})`,
          }}
          title={unit.spec === CombatUnitSpec.None ? Utils.getClassName(unit.class) : Utils.getSpecName(unit.spec)}
        />
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
