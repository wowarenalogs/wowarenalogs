import { useContext } from 'react';
import { CombatAction } from 'wow-combat-log-parser';

import { Box } from '../../../../../common/Box';
import { CombatReportContext } from '../../../CombatReportContext';
import { ReplayEventSpellInfo } from '../ReplayEventSpellInfo';
import { ReplayEventTimestamp } from '../ReplayEventTimestamp';

interface IProps {
  event: CombatAction;
  expanded?: boolean;
}

export function ReplayAuraDoseUpdatedEvent(props: IProps) {
  const context = useContext(CombatReportContext);
  if (!context.combat) {
    return null;
  }

  return (
    <Box display="flex" flexDirection="row" flexWrap="wrap" my={0.5} alignItems="center">
      <Box mr={1}>
        <ReplayEventTimestamp timestamp={props.event.timestamp} />
      </Box>
      <ReplayEventSpellInfo event={props.event} direction="right" expanded={props.expanded} />
    </Box>
  );
}
