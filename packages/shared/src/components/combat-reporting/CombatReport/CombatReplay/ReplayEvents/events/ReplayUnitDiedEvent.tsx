import { StopOutlined } from '@ant-design/icons';
import Text from 'antd/lib/typography/Text';
import { useContext } from 'react';
import { CombatAction, ICombatUnit } from 'wow-combat-log-parser';

import { Box } from '../../../../../common/Box';
import { CombatReportContext } from '../../../CombatReportContext';
import { ReplayEventTimestamp } from '../ReplayEventTimestamp';
import { ReplayEventUnit } from '../ReplayEventUnit';

interface IProps {
  event: CombatAction;
  expanded?: boolean;
}

export function ReplayUnitDiedEvent(props: IProps) {
  const context = useContext(CombatReportContext);
  if (!context.combat) {
    return null;
  }

  const destUnit: ICombatUnit | undefined = context.combat.units[props.event.destUnitId];
  if (!destUnit) {
    return null;
  }

  return (
    <Box display="flex" flexDirection="row" flexWrap="wrap" my={0.5} alignItems="center">
      <Box mr={1}>
        <ReplayEventTimestamp timestamp={props.event.timestamp} />
      </Box>
      <ReplayEventUnit unit={destUnit} expanded={props.expanded} />
      {props.expanded ? (
        <Box ml={0.5}>died</Box>
      ) : (
        <Box ml={1}>
          <Text type="secondary" style={{ fontSize: 18 }}>
            <StopOutlined style={{ color: 'rgba(255, 255, 255, 0.45)' }} />
          </Text>
        </Box>
      )}
    </Box>
  );
}
