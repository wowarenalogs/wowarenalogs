import { ILogLine, LogEvent } from '../types';
import { parseQuotedName } from '../utils';
import { CombatAction } from './CombatAction';

export class CombatExtraSpellAction extends CombatAction {
  public static supports(logLine: ILogLine): boolean {
    return (
      super.supports(logLine) &&
      (logLine.event === LogEvent.SPELL_INTERRUPT ||
        logLine.event === LogEvent.SPELL_STOLEN ||
        logLine.event === LogEvent.SPELL_DISPEL ||
        logLine.event === LogEvent.SPELL_DISPEL_FAILED)
    );
  }

  public readonly extraSpellId: string;
  public readonly extraSpellName: string;

  constructor(logLine: ILogLine) {
    super(logLine);
    if (!CombatExtraSpellAction.supports(logLine)) {
      throw new Error('Event not supported as CombatExtraSpellAction: ' + logLine.raw);
    }

    this.extraSpellId = logLine.parameters[11].toString();
    this.extraSpellName = parseQuotedName(logLine.parameters[12]);
  }
}
