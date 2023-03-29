import { ILogLine } from '../types';

export interface ZoneChangeInfo {
  timestamp: number;
  instanceId: number;
  zoneName: string;
  difficultyID: number;
}

export class ZoneChange implements ZoneChangeInfo {
  public static supports(logLine: ILogLine): boolean {
    return logLine.event.startsWith('ZONE_CHANGE');
  }

  public readonly timestamp: number;
  public readonly instanceId: number;
  public readonly zoneName: string;
  public readonly difficultyID: number;

  constructor(public readonly logLine: ILogLine) {
    if (!ZoneChange.supports(logLine)) {
      throw new Error('Event not supported as ZoneChange: ' + logLine.raw);
    }

    this.timestamp = logLine.timestamp;

    this.instanceId = logLine.parameters[0];
    this.zoneName = logLine.parameters[1].toString();
    this.difficultyID = logLine.parameters[2];
  }
}
