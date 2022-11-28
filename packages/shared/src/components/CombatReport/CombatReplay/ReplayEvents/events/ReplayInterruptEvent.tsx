import { CombatExtraSpellAction } from '@wowarenalogs/parser';

import { SpellIcon } from '../../../SpellIcon';
import { ReplayEventSpellInfo } from '../ReplayEventSpellInfo';
import { ReplayEventContainer } from './ReplayEventContainer';

interface IProps {
  event: CombatExtraSpellAction;
  expanded?: boolean;
}

export function ReplayInterruptEvent(props: IProps) {
  return (
    <ReplayEventContainer {...props}>
      <ReplayEventSpellInfo event={props.event} direction="stop" expanded={props.expanded} />
      {props.expanded && <div className="ml-0.5">and interrupted</div>}
      <div className="ml-0.5">
        <SpellIcon spellId={props.event.extraSpellId || '0'} size={24} />
      </div>
      {props.expanded && <div className="mx-0.5">{props.event.extraSpellName}</div>}
    </ReplayEventContainer>
  );
}
