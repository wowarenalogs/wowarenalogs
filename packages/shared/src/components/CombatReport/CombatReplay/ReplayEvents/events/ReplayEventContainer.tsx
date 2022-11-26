import { CombatAction } from '@wowarenalogs/parser';
import { ReactNode } from 'react';

import { ReplayEventSpellInfo } from '../ReplayEventSpellInfo';
import { ReplayEventTimestamp } from '../ReplayEventTimestamp';

interface IProps {
  event: CombatAction;
  expanded?: boolean;
  children?: ReactNode | ReactNode[];
}

export function ReplayEventContainer(props: IProps) {
  return (
    <div className="flex flex-row flex-wrap my-0.5 items-center">
      <div className="mr-1">
        <ReplayEventTimestamp timestamp={props.event.timestamp} />
      </div>
      {props.children ? (
        props.children
      ) : (
        <ReplayEventSpellInfo event={props.event} direction="right" expanded={props.expanded} />
      )}
    </div>
  );
}
