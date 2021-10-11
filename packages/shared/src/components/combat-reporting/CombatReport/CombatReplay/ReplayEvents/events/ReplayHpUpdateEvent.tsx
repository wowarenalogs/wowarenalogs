import Text from 'antd/lib/typography/Text';
import { useContext } from 'react';
import { CombatHpUpdateAction } from 'wow-combat-log-parser';

import { isCrit } from '../../../../../../utils/parserShims';
import { Box } from '../../../../../common/Box';
import { CombatReportContext } from '../../../CombatReportContext';
import { ReplayEventSpellInfo } from '../ReplayEventSpellInfo';
import { ReplayEventTimestamp } from '../ReplayEventTimestamp';

interface IProps {
  event: CombatHpUpdateAction;
  expanded?: boolean;
}

export function ReplayHpUpdateEvent(props: IProps) {
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
      {props.expanded && <Box ml={0.5}>and dealt</Box>}
      <Box ml={0.5}>
        <Text type={props.event.amount >= 0 ? 'success' : 'danger'} strong>
          {props.event.amount > 0 ? '+' : ''}
          {props.event.amount}
          {isCrit(props.event, context.combat.wowVersion) ? '*' : ''}
        </Text>
      </Box>
    </Box>
  );
}
