import { CombatHpUpdateAction } from '@wowarenalogs/parser';

import { ReplayEventSpellInfo } from '../ReplayEventSpellInfo';
import { ReplayEventContainer } from './ReplayEventContainer';

interface IProps {
  event: CombatHpUpdateAction;
  expanded?: boolean;
}

export function ReplayHpUpdateEvent(props: IProps) {
  return (
    <ReplayEventContainer {...props}>
      <ReplayEventSpellInfo event={props.event} direction="right" expanded={props.expanded} />
      {props.expanded && <div className="ml-0.5">and dealt</div>}
      <div className="ml-0.5">
        <div className={`${props.event.amount >= 0 ? 'text-success' : 'text-error'} font-bold`}>
          {props.event.amount > 0 ? '+' : ''}
          {props.event.amount}
          {
            // TODO: implement isCrit in parser
            // {isCrit(props.event, context.combat.wowVersion) ? '*' : ''}
          }
        </div>
      </div>
    </ReplayEventContainer>
  );
}
