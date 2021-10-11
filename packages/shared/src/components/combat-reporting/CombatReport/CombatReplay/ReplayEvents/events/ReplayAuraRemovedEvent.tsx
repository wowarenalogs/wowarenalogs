import { CloseCircleOutlined } from '@ant-design/icons';
import Text from 'antd/lib/typography/Text';
import { useContext } from 'react';
import { CombatAction, ICombatUnit } from 'wow-combat-log-parser';

import { Box } from '../../../../../common/Box';
import { CombatReportContext } from '../../../CombatReportContext';
import { SpellIcon } from '../../../SpellIcon';
import { ReplayEventTimestamp } from '../ReplayEventTimestamp';
import { ReplayEventUnit } from '../ReplayEventUnit';

interface IProps {
  event: CombatAction;
  expanded?: boolean;
}

export function ReplayAuraRemovedEvent(props: IProps) {
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
      {props.expanded ? (
        <>
          <SpellIcon spellId={props.event.spellId || '0'} size={24} />
          <Box mx={0.5}>{props.event.spellName} on</Box>
          <ReplayEventUnit unit={destUnit} expanded={props.expanded} />
          <Box ml={0.5}>ended</Box>
        </>
      ) : (
        <>
          <ReplayEventUnit unit={destUnit} expanded={props.expanded} />
          <Box ml={0.5}>
            <SpellIcon spellId={props.event.spellId || '0'} size={24} />
          </Box>
          <Box ml={1}>
            <Text type="secondary" style={{ fontSize: 18 }}>
              <CloseCircleOutlined style={{ color: 'rgba(255, 255, 255, 0.45)' }} />
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
}
