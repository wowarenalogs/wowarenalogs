import { CombatAction } from '@wowarenalogs/parser';

import { ReplayEventContainer } from './ReplayEventContainer';

interface IProps {
  event: CombatAction;
  expanded?: boolean;
}

export function ReplayAuraDoseUpdatedEvent(props: IProps) {
  return <ReplayEventContainer {...props} />;
}
