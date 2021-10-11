import { useContext } from 'react';
import { CombatExtraSpellAction } from 'wow-combat-log-parser';

import { Box } from '../../../../../common/Box';
import { CombatReportContext } from '../../../CombatReportContext';
import { SpellIcon } from '../../../SpellIcon';
import { ReplayEventSpellInfo } from '../ReplayEventSpellInfo';
import { ReplayEventTimestamp } from '../ReplayEventTimestamp';

interface IProps {
  event: CombatExtraSpellAction;
  expanded?: boolean;
}

export function ReplayInterruptEvent(props: IProps) {
  const context = useContext(CombatReportContext);
  if (!context.combat) {
    return null;
  }

  return (
    <Box display="flex" flexDirection="row" flexWrap="wrap" my={0.5} alignItems="center">
      <Box mr={1}>
        <ReplayEventTimestamp timestamp={props.event.timestamp} />
      </Box>
      <ReplayEventSpellInfo event={props.event} direction="stop" expanded={props.expanded} />
      {props.expanded && <Box ml={0.5}>and interrupted</Box>}
      <Box ml={0.5}>
        <SpellIcon spellId={props.event.extraSpellId || '0'} size={24} />
      </Box>
      {props.expanded && <Box mx={0.5}>{props.event.extraSpellName}</Box>}
    </Box>
  );
}
