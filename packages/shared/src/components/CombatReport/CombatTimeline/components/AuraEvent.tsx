import moment from 'moment';
import Image from 'next/image';

import { Utils } from '../../../../utils/utils';
import { IAuraEvent } from '../utils';

interface IProps {
  event: IAuraEvent;
  eventKey: string;
  yPosition: number;
  spellIconSize?: number;
  eventHorizontalPadding?: number;
}

export const AuraEvent = ({ event, eventKey, yPosition, spellIconSize = 24, eventHorizontalPadding = 0 }: IProps) => {
  const isApplied = event.event === 'applied';

  return (
    <div
      key={eventKey}
      className="absolute flex items-center z-10"
      style={{ top: yPosition, left: eventHorizontalPadding, right: eventHorizontalPadding }}
    >
      <div
        className={`relative flex items-center p-1 rounded w-full ${
          isApplied ? 'bg-info bg-opacity-20 border border-info' : 'bg-neutral bg-opacity-20 border border-neutral'
        }`}
        title={`${event.spellName} ${isApplied ? 'aura gained' : 'aura removed'} at ${moment
          .utc(event.timeOffset)
          .format('mm:ss.SSS')}${event.sourceUnit ? ` from ${event.sourceUnit}` : ''}`}
      >
        <div className="w-6 h-6 mr-2 relative">
          <Image
            className="rounded"
            src={Utils.getSpellIcon(event.spellId) ?? 'https://images.wowarenalogs.com/spells/0.jpg'}
            width={spellIconSize}
            height={spellIconSize}
            alt={event.spellName}
          />
          <div
            className={`absolute -top-1 -right-1 w-3 h-3 rounded-full text-xs flex items-center justify-center ${
              isApplied ? 'bg-success text-success-content' : 'bg-error text-error-content'
            }`}
          >
            {isApplied ? '+' : '−'}
          </div>
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{event.spellName}</div>
          <div className="text-xs opacity-75">
            {isApplied ? 'Aura Gained' : 'Aura Removed'} •{moment.utc(event.timeOffset).format('mm:ss.SSS')}
          </div>
        </div>
      </div>
    </div>
  );
};
