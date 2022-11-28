import { ILogLine } from '../types';

export interface ArenaMatchEndInfo {
  timestamp: number;
  winningTeamId: string;
  matchDurationInSeconds: number;
  team0MMR: number;
  team1MMR: number;
}

export class ArenaMatchEnd implements ArenaMatchEndInfo {
  public static supports(logLine: ILogLine): boolean {
    return logLine.event.startsWith('ARENA_MATCH_END');
  }

  public readonly timestamp: number;
  public readonly winningTeamId: string;
  public readonly matchDurationInSeconds: number;
  public readonly team0MMR: number;
  public readonly team1MMR: number;

  constructor(public readonly logLine: ILogLine) {
    if (!ArenaMatchEnd.supports(logLine)) {
      throw new Error('Event not supported as ArenaMatchEnd: ' + logLine.raw);
    }

    this.timestamp = logLine.timestamp;

    this.winningTeamId = logLine.parameters[0].toString();
    this.matchDurationInSeconds = logLine.parameters[1];
    this.team0MMR = logLine.parameters[2];
    this.team1MMR = logLine.parameters[3];
  }
}
