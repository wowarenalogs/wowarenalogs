import { ILogLine, WowVersion } from '../types';
import { CombatAbsorbAction } from './CombatAbsorbAction';

export class CombatAbsorbSupportAction extends CombatAbsorbAction {
  public static supports(logLine: ILogLine): boolean {
    return super.supports(logLine) && logLine.event === 'SPELL_ABSORBED_SUPPORT';
  }

  public readonly supportActorId: string;

  public supportedShieldSpellId: string | null = null;
  public supportedShieldSpellName: string | null = null;

  constructor(logLine: ILogLine, wowVersion: WowVersion) {
    super(logLine, wowVersion);
    if (!CombatAbsorbSupportAction.supports(logLine)) {
      throw new Error('Event not supported as CombatAbsorbSupportAction: ' + logLine.raw);
    }

    this.supportActorId = logLine.parameters[logLine.parameters.length - 1].toString();
  }
}
