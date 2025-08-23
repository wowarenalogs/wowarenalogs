import moment from 'moment';
import Image from 'next/image';

import { Utils } from '../../../../utils/utils';
import { IInterruptEvent } from '../utils';

interface IProps {
  event: IInterruptEvent;
  eventKey: string;
  yPosition: number;
  spellIconSize?: number;
  eventHorizontalPadding?: number;
}

export const InterruptEvent = ({
  event,
  eventKey,
  yPosition,
  spellIconSize = 24,
  eventHorizontalPadding = 0,
}: IProps) => {
  // For interrupt events, the playerId is the player whose timeline this event appears on
  // If playerId matches the source (interrupter), they interrupted someone
  // If playerId matches the target (interrupted), they were interrupted
  const isInterrupter = event.playerId === event.logLine.parameters[0]?.toString(); // srcUnitId

  return (
    <div
      key={eventKey}
      className="absolute flex items-center z-10"
      style={{ top: yPosition, left: eventHorizontalPadding, right: eventHorizontalPadding }}
    >
      <div
        className={`relative flex items-center p-1 rounded w-full ${
          isInterrupter
            ? 'bg-success bg-opacity-20 border border-success'
            : 'bg-error bg-opacity-20 border border-error'
        }`}
        title={`${event.spellName} interrupted ${event.interruptedSpellName} at ${moment
          .utc(event.timeOffset)
          .format('mm:ss.SSS')}`}
      >
        <div className="w-6 h-6 mr-2 relative">
          <Image
            className="rounded"
            src={Utils.getSpellIcon(event.spellId) ?? 'https://images.wowarenalogs.com/spells/0.jpg'}
            width={spellIconSize}
            height={spellIconSize}
            alt={event.spellName}
          />
          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full text-xs flex items-center justify-center bg-error text-error-content">
            ⚡
          </div>
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{event.spellName}</div>
          <div className="text-xs opacity-75">
            {isInterrupter ? 'Interrupted cast' : 'Was Interrupted'} •{' '}
            {moment.utc(event.timeOffset).format('mm:ss.SSS')}
            <br />
            <span className="opacity-60">→ {event.interruptedSpellName}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
