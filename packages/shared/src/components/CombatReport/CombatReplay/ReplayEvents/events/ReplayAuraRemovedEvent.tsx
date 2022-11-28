import { CombatAction, ICombatUnit } from '@wowarenalogs/parser';
import { TbCircleX } from 'react-icons/tb';

import { useCombatReportContext } from '../../../CombatReportContext';
import { SpellIcon } from '../../../SpellIcon';
import { ReplayEventUnit } from '../ReplayEventUnit';
import { ReplayEventContainer } from './ReplayEventContainer';

interface IProps {
  event: CombatAction;
  expanded?: boolean;
}

export function ReplayAuraRemovedEvent(props: IProps) {
  const context = useCombatReportContext();
  const destUnit: ICombatUnit | undefined = context?.combat?.units[props.event.destUnitId];
  if (!destUnit) {
    return null;
  }

  return (
    <ReplayEventContainer {...props}>
      {props.expanded ? (
        <>
          <SpellIcon spellId={props.event.spellId || '0'} size={24} />
          <div className="mx-0.5">{props.event.spellName} on</div>
          <ReplayEventUnit unit={destUnit} expanded={props.expanded} />
          <div className="ml-0.5">ended</div>
        </>
      ) : (
        <>
          <ReplayEventUnit unit={destUnit} expanded={props.expanded} />
          <div className="ml-0.5">
            <SpellIcon spellId={props.event.spellId || '0'} size={24} />
          </div>
          <div className="ml-1">
            <div className="opacity-60 text-lg">
              <TbCircleX />
            </div>
          </div>
        </>
      )}
    </ReplayEventContainer>
  );
}
