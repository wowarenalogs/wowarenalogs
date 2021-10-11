import { ArrowRightOutlined, ArrowLeftOutlined, StopOutlined, CloseCircleOutlined } from '@ant-design/icons';
import Text from 'antd/lib/typography/Text';
import { useContext } from 'react';
import { CombatAction, ICombatUnit, LogEvent } from 'wow-combat-log-parser';

import { getDosesCount } from '../../../../../utils/parserShims';
import { Box } from '../../../../common/Box';
import { CombatReportContext } from '../../CombatReportContext';
import { SpellIcon } from '../../SpellIcon';
import { ReplayEventUnit } from './ReplayEventUnit';

interface IProps {
  event: CombatAction;
  direction: 'left' | 'right' | 'stop' | 'remove';
  expanded?: boolean;
}

export function ReplayEventSpellInfo(props: IProps) {
  const context = useContext(CombatReportContext);
  if (!context.combat) {
    return null;
  }

  const srcUnit: ICombatUnit | undefined = context.combat.units[props.event.srcUnitId];
  const destUnit: ICombatUnit | undefined = context.combat.units[props.event.destUnitId];

  const isDosingEvent =
    props.event.logLine.event === LogEvent.SPELL_AURA_APPLIED_DOSE ||
    props.event.logLine.event === LogEvent.SPELL_AURA_REMOVED_DOSE;

  if (isDosingEvent) {
    const changedText =
      props.event.logLine.event === LogEvent.SPELL_AURA_APPLIED_DOSE ? 'increased to' : 'decreased to';
    const changedColor = props.event.logLine.event === LogEvent.SPELL_AURA_APPLIED_DOSE ? 'green' : 'red';

    if (props.expanded) {
      return (
        <Box display="flex" flexDirection="row" flexWrap="wrap" alignItems="center">
          {srcUnit && <ReplayEventUnit unit={srcUnit} expanded={props.expanded} />}
          <Box mx={0.5}>
            <Text type="secondary">stacks of</Text>
          </Box>
          <Box ml={0.5}>
            <SpellIcon spellId={props.event.spellId || '0'} size={24} />
          </Box>
          <Box ml={0.5}>{props.event.spellName}</Box>
          <Box mx={0.5}>
            <Text type="secondary">on</Text>
          </Box>
          {destUnit && <ReplayEventUnit unit={destUnit} expanded={props.expanded} />}
          <Box mx={0.5}>
            <Text type="secondary">{changedText}</Text>
            <Text style={{ marginLeft: 4 }}>{getDosesCount(props.event, context.combat.wowVersion)}</Text>
          </Box>
        </Box>
      );
    } else {
      return (
        <Box display="flex" flexDirection="row" flexWrap="wrap" alignItems="center">
          <ReplayEventUnit unit={destUnit} expanded={props.expanded} />
          <Box ml={0.5}>
            <SpellIcon spellId={props.event.spellId || '0'} size={24} />
          </Box>
          <Box mx={0.5}>
            <Text style={{ color: changedColor, marginLeft: 4 }}>{`[${getDosesCount(
              props.event,
              context.combat.wowVersion,
            )}]`}</Text>
          </Box>
        </Box>
      );
    }
  }

  return (
    <Box display="flex" flexDirection="row" flexWrap="wrap" alignItems="center">
      {srcUnit && <ReplayEventUnit unit={srcUnit} expanded={props.expanded} />}
      {props.expanded && (
        <Box mx={0.5}>
          <Text type="secondary">casted</Text>
        </Box>
      )}
      <Box ml={0.5}>
        <SpellIcon spellId={props.event.spellId || '0'} size={24} />
      </Box>
      {props.expanded && <Box ml={0.5}>{props.event.spellName}</Box>}
      {srcUnit.id !== destUnit.id || props.direction !== 'right' || props.expanded ? (
        <>
          {props.expanded && (
            <Box mx={0.5}>
              <Text type="secondary">on</Text>
            </Box>
          )}
          {!props.expanded && (
            <Box mx={1}>
              <Text type="secondary" style={{ fontSize: 18 }}>
                {(() => {
                  switch (props.direction) {
                    case 'left':
                      return <ArrowLeftOutlined />;
                    case 'right':
                      return <ArrowRightOutlined />;
                    case 'stop':
                      return <StopOutlined />;
                    case 'remove':
                      return <CloseCircleOutlined />;
                  }
                })()}
              </Text>
            </Box>
          )}
          {destUnit && <ReplayEventUnit unit={destUnit} expanded={props.expanded} />}
        </>
      ) : (
        <Box ml={0.5} />
      )}
    </Box>
  );
}
