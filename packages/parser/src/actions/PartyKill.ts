import { ILogLine } from '../types';
import { parseQuotedName } from '../utils';

export class PartyKill {
  public static supports(logLine: ILogLine): boolean {
    return logLine.event.startsWith('PARTY_KILL') && logLine.parameters.length >= 7;
  }

  public readonly timestamp: number;
  /**
   * The killing unit
   */
  public readonly srcUnitName: string;
  /**
   * The killing unit
   */
  public readonly srcUnitId: string;
  public readonly srcUnitFlags: number;
  /**
   * The killed unit
   */
  public readonly destUnitName: string;
  /**
   * The killed unit
   */
  public readonly destUnitId: string;
  public readonly destUnitFlags: number;

  constructor(public readonly logLine: ILogLine) {
    if (!PartyKill.supports(logLine)) {
      throw new Error('event not supported');
    }

    this.timestamp = logLine.timestamp;

    this.srcUnitId = logLine.parameters[0].toString();
    this.srcUnitName = parseQuotedName(logLine.parameters[1]);
    this.srcUnitFlags = logLine.parameters[2];

    this.destUnitId = logLine.parameters[4].toString();
    this.destUnitName = parseQuotedName(logLine.parameters[5]);
    this.destUnitFlags = logLine.parameters[6];
  }
}
