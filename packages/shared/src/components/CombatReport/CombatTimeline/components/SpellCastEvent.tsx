import { AtomicArenaCombat, LogEvent } from '@wowarenalogs/parser';
import moment from 'moment';
import Image from 'next/image';

import { Utils } from '../../../../utils/utils';
import { SpecImage } from '../../../common/SpecImage';
import { ISpellCastTimelineEvent } from '../utils';

interface IProps {
  event: ISpellCastTimelineEvent;
  eventKey: string;
  yPosition: number;
  playerId: string;
  combat: AtomicArenaCombat; // TODO: Type this properly
  spellIconSize?: number;
  eventHorizontalPadding?: number;
}

export const SpellCastEvent = ({
  event,
  eventKey,
  yPosition,
  playerId,
  combat,
  spellIconSize = 24,
  eventHorizontalPadding = 0,
}: IProps) => {
  const isSuccess = event.event === LogEvent.SPELL_CAST_SUCCESS;

  return (
    <div
      key={eventKey}
      className="absolute flex items-center z-10"
      style={{ top: yPosition, left: eventHorizontalPadding, right: eventHorizontalPadding }}
    >
      <div
        className={`relative flex items-center p-1 rounded w-full ${
          isSuccess
            ? 'bg-success bg-opacity-20 border border-success'
            : 'bg-warning bg-opacity-20 border border-warning'
        }`}
        title={`${event.spellName} - ${event.event} at ${moment.utc(event.timeOffset).format('mm:ss.SSS')}${
          event.targetName ? ` → ${event.targetName}` : ''
        }`}
      >
        <div className="w-6 h-6 mr-2">
          <Image
            className="rounded"
            src={Utils.getSpellIcon(event.spellId) ?? 'https://images.wowarenalogs.com/spells/0.jpg'}
            width={spellIconSize}
            height={spellIconSize}
            alt={event.spellName}
          />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{event.spellName}</div>
          <div className="text-xs opacity-75">
            {isSuccess ? 'Cast' : 'Started'} •{moment.utc(event.timeOffset).format('mm:ss.SSS')}
            {event.deltaMs !== undefined &&
              ` • Δ${
                event.deltaMs === 0
                  ? '0s'
                  : event.deltaMs < 1000
                  ? `${event.deltaMs}ms`
                  : `${(event.deltaMs / 1000).toFixed(1)}s`
              }`}
          </div>
        </div>
        {event.targetId &&
          event.targetId !== '0000000000000000' &&
          event.targetId !== '0' &&
          combat?.units[event.targetId] &&
          event.targetId !== playerId && (
            <div className="flex items-center ml-2">
              <span className="text-xs opacity-60 mr-1">→</span>
              <SpecImage specId={combat.units[event.targetId].spec} size={16} />
            </div>
          )}
      </div>
    </div>
  );
};
