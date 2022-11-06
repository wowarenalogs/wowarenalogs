import { ILogLine } from '../types';
import { parseQuotedName } from '../utils';

export class CombatAction {
  public static supports(logLine: ILogLine): boolean {
    return (
      (logLine.event.startsWith('SWING_') ||
        logLine.event.startsWith('RANGE_') ||
        logLine.event.startsWith('SPELL_') ||
        logLine.event === 'UNIT_DIED') &&
      logLine.parameters.length >= 8
    );
  }

  public readonly timestamp: number;
  public readonly srcUnitName: string;
  public readonly srcUnitId: string;
  public readonly srcUnitFlags: number;
  public readonly destUnitName: string;
  public readonly destUnitId: string;
  public readonly destUnitFlags: number;
  public readonly spellId: string | null;
  public readonly spellName: string | null;
  public readonly spellSchoolId: string | null;

  constructor(public readonly logLine: ILogLine) {
    if (!CombatAction.supports(logLine)) {
      throw new Error('Event not supported as CombatAction: ' + logLine.raw);
    }

    this.timestamp = logLine.timestamp;

    this.srcUnitId = logLine.parameters[0].toString();
    this.srcUnitName = parseQuotedName(logLine.parameters[1]);
    this.srcUnitFlags = logLine.parameters[2];

    this.destUnitId = logLine.parameters[4].toString();
    this.destUnitName = parseQuotedName(logLine.parameters[5]);
    this.destUnitFlags = logLine.parameters[6];

    if (logLine.event === 'SPELL_ABSORBED') {
      // SPELL_ABSORBED is kind of unique
      // it holds absorbs for both spell and melee attacks
      if (logLine.parameters.length < 20) {
        this.spellId = null;
        this.spellName = null;
        this.spellSchoolId = null;
      } else {
        this.spellId = logLine.parameters[8].toString();
        this.spellName = parseQuotedName(logLine.parameters[9]);
        this.spellSchoolId = logLine.parameters[10].toString();
      }
    } else if (logLine.event.startsWith('RANGE_') || logLine.event.startsWith('SPELL_')) {
      this.spellId = logLine.parameters[8].toString();
      this.spellName = parseQuotedName(logLine.parameters[9]);
      this.spellSchoolId = logLine.parameters[10].toString();
    } else {
      this.spellId = null;
      this.spellName = null;
      this.spellSchoolId = null;
    }
  }
}
