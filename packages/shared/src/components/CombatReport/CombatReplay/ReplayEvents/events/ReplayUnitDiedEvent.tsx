import { CombatAction, ICombatUnit } from '@wowarenalogs/parser';
import { FaSkullCrossbones } from 'react-icons/fa';

import { useCombatReportContext } from '../../../CombatReportContext';
import { ReplayEventUnit } from '../ReplayEventUnit';
import { ReplayEventContainer } from './ReplayEventContainer';

interface IProps {
  event: CombatAction;
  expanded?: boolean;
}

export function ReplayUnitDiedEvent(props: IProps) {
  const context = useCombatReportContext();
  if (!context.combat) {
    return null;
  }

  const destUnit: ICombatUnit | undefined = context.combat.units[props.event.destUnitId];
  if (!destUnit) {
    return null;
  }
  return (
    <ReplayEventContainer {...props}>
      <ReplayEventUnit unit={destUnit} expanded={props.expanded} />
      {props.expanded ? (
        <div className="ml-0.5">died</div>
      ) : (
        <div className="ml-1">
          <div className="opacity-60 text-lg">
            <FaSkullCrossbones />
          </div>
        </div>
      )}
    </ReplayEventContainer>
  );
}
