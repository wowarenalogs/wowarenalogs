import { ILogLine, LogEvent } from '@wowarenalogs/parser';

export interface ISpellCastTimelineEvent {
  type: 'spellcast';
  spellId: string;
  spellName: string;
  timestamp: number;
  timeOffset: number;
  event: LogEvent;
  succeeded?: boolean;
  targetName?: string;
  targetId?: string;
  playerId: string;
  eventKey?: string;
  logLine?: ILogLine;
  deltaMs?: number;
}

export interface IAuraEvent {
  type: 'aura';
  spellId: string;
  spellName: string;
  timestamp: number;
  timeOffset: number;
  event: 'applied' | 'removed';
  sourceUnit?: string;
  playerId: string;
  logLine: ILogLine;
  eventKey?: string;
}

export interface IInterruptEvent {
  type: 'interrupt';
  spellId: string;
  spellName: string;
  interruptedSpellId: string;
  interruptedSpellName: string;
  timestamp: number;
  timeOffset: number;
  playerId: string;
  targetId: string;
  logLine: ILogLine;
  eventKey?: string;
}

type TimelineEvent = ISpellCastTimelineEvent | IAuraEvent | IInterruptEvent;

/**
 * Generate a unique log line ID for timeline events
 * @param event - The timeline event to generate an ID for
 * @param index - Optional index for fallback IDs (used in positioning)
 * @returns A unique string identifier for the event
 */
export const getLogLineId = (event: TimelineEvent, index?: number): string => {
  switch (event.type) {
    case 'aura':
      return event.logLine.id;
    case 'interrupt':
      return event.logLine.id;
    case 'spellcast':
      return event.logLine?.id || `fallback-${event.timestamp}-${event.spellId}-${event.event}-${index || 0}`;
    default:
      console.error('Unknown event type', event);
      return `fallback-${Math.random().toFixed(5)}-${index || 0}`;
  }
};
