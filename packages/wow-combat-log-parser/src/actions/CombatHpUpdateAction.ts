import { ILogLine, WowVersion } from '../types';
import { CombatAdvancedAction } from './CombatAdvancedAction';

export class CombatHpUpdateAction extends CombatAdvancedAction {
  public static supports(logLine: ILogLine): boolean {
    return super.supports(logLine) && (logLine.event.endsWith('_DAMAGE') || logLine.event.endsWith('_HEAL'));
  }

  public readonly amount: number;

  constructor(logLine: ILogLine, wowVersion: WowVersion) {
    super(logLine, wowVersion);
    if (!CombatHpUpdateAction.supports(logLine)) {
      throw new Error('event not supported');
    }

    const wowVersionOffset = wowVersion === 'retail' ? 0 : -1;

    if (logLine.event === 'SWING_DAMAGE') {
      this.amount = -1 * logLine.parameters[25 + wowVersionOffset];
    } else if (logLine.event.endsWith('_DAMAGE')) {
      this.amount = -1 * logLine.parameters[28 + wowVersionOffset];
    } else {
      this.amount = logLine.parameters[28 + wowVersionOffset];
    }
  }
}
