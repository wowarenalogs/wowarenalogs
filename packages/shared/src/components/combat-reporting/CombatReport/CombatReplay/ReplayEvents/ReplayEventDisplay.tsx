import React from 'react';
import {
  CombatAction,
  CombatEvent,
  CombatExtraSpellAction,
  CombatHpUpdateAction,
  LogEvent,
} from 'wow-combat-log-parser';

import { ReplayAuraAppliedEvent } from './events/ReplayAuraAppliedEvent';
import { ReplayAuraDoseUpdatedEvent } from './events/ReplayAuraDoseUpdatedEvent';
import { ReplayAuraRemovedEvent } from './events/ReplayAuraRemovedEvent';
import { ReplayDispelEvent } from './events/ReplayDispelEvent';
import { ReplayHpUpdateEvent } from './events/ReplayHpUpdateEvent';
import { ReplayInterruptEvent } from './events/ReplayInterruptEvent';
import { ReplaySpellStolenEvent } from './events/ReplaySpellStolenEvent';
import { ReplayUnitDiedEvent } from './events/ReplayUnitDiedEvent';

interface IProps {
  event: CombatEvent;
  expanded?: boolean;
}

export const ReplayEventDisplay = React.memo(function ReplayEventDisplay(props: IProps) {
  const e = props.event;

  if (e instanceof CombatHpUpdateAction) {
    return <ReplayHpUpdateEvent event={e} expanded={props.expanded} />;
  } else if (e instanceof CombatExtraSpellAction) {
    switch (e.logLine.event) {
      case LogEvent.SPELL_INTERRUPT:
        return <ReplayInterruptEvent event={e} expanded={props.expanded} />;
      case LogEvent.SPELL_DISPEL:
        return <ReplayDispelEvent event={e} expanded={props.expanded} />;
      case LogEvent.SPELL_STOLEN:
        return <ReplaySpellStolenEvent event={e} expanded={props.expanded} />;
    }
  } else if (e instanceof CombatAction) {
    switch (e.logLine.event) {
      case LogEvent.UNIT_DIED:
        return <ReplayUnitDiedEvent event={e} expanded={props.expanded} />;
      case LogEvent.SPELL_AURA_APPLIED:
        return <ReplayAuraAppliedEvent event={e} expanded={props.expanded} />;
      case LogEvent.SPELL_AURA_REMOVED:
        return <ReplayAuraRemovedEvent event={e} expanded={props.expanded} />;
      case LogEvent.SPELL_AURA_APPLIED_DOSE:
        return <ReplayAuraDoseUpdatedEvent event={e} expanded={props.expanded} />;
      case LogEvent.SPELL_AURA_REMOVED_DOSE:
        return <ReplayAuraDoseUpdatedEvent event={e} expanded={props.expanded} />;
    }
  }

  return null;
});
