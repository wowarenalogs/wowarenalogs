import { ILogLine } from '../types';

export interface ArenaMatchStartInfo {
  timestamp: number;
  zoneId: string;
  item1: string;
  bracket: string;
  isRanked: boolean;
}

export class ArenaMatchStart implements ArenaMatchStartInfo {
  public static supports(logLine: ILogLine): boolean {
    return logLine.event.startsWith('ARENA_MATCH_START');
  }

  public readonly timestamp: number;
  public readonly zoneId: string;
  public readonly item1: string;
  public readonly bracket: string;
  public readonly isRanked: boolean;

  constructor(public readonly logLine: ILogLine) {
    if (!ArenaMatchStart.supports(logLine)) {
      throw new Error('Event not supported as ArenaMatchStart: ' + logLine.raw);
    }

    this.timestamp = logLine.timestamp;

    this.zoneId = logLine.parameters[0].toString();
    this.item1 = logLine.parameters[1].toString();
    this.bracket = logLine.parameters[2].toString();
    this.isRanked = logLine.parameters[3] === 1;
  }
}
