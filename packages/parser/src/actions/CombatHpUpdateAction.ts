import { CombatUnitType, ILogLine, WowVersion } from '../types';
import { getUnitType } from '../utils';
import { CombatAdvancedAction } from './CombatAdvancedAction';

export class CombatHpUpdateAction extends CombatAdvancedAction {
  public static supports(logLine: ILogLine): boolean {
    return (
      super.supports(logLine) &&
      (logLine.event.endsWith('_DAMAGE') || logLine.event.endsWith('_HEAL') || logLine.event.endsWith('_LANDED'))
    );
  }

  public readonly amount: number;
  public readonly absorbedAmount: number;
  public readonly isCritical: boolean;

  // for damage events, "effective" means damage done to a player.
  // for heal events, "effective" means healing done to a player, excluding overheal.
  public readonly effectiveAmount: number;

  constructor(logLine: ILogLine, wowVersion: WowVersion) {
    super(logLine, wowVersion);
    if (!CombatHpUpdateAction.supports(logLine)) {
      throw new Error('Event not supported as CombatHpUpdateAction: ' + logLine.raw);
    }

    const wowVersionOffset = wowVersion === 'retail' ? 0 : -1;

    if (logLine.event === 'SWING_DAMAGE') {
      this.amount = -1 * logLine.parameters[25 + wowVersionOffset];
      this.absorbedAmount = -1 * logLine.parameters[31 + wowVersionOffset];
      this.isCritical = logLine.parameters[32 + wowVersionOffset] === 1;

      if (getUnitType(this.destUnitFlags) === CombatUnitType.Player) {
        this.effectiveAmount = this.amount + this.absorbedAmount;
      } else {
        this.effectiveAmount = 0;
      }
    } else if (logLine.event.endsWith('_DAMAGE')) {
      this.amount = -1 * logLine.parameters[28 + wowVersionOffset];
      this.absorbedAmount = -1 * logLine.parameters[34 + wowVersionOffset];
      this.isCritical = logLine.parameters[35 + wowVersionOffset] === 1;

      if (getUnitType(this.destUnitFlags) === CombatUnitType.Player) {
        this.effectiveAmount = this.amount + this.absorbedAmount;
      } else {
        this.effectiveAmount = 0;
      }
    } else {
      this.amount = logLine.parameters[28 + wowVersionOffset];
      const overheal = logLine.parameters[30 + wowVersionOffset] ?? 0;
      this.absorbedAmount = logLine.parameters[31 + wowVersionOffset];
      this.isCritical = logLine.parameters[32 + wowVersionOffset] === 1;

      if (getUnitType(this.destUnitFlags) === CombatUnitType.Player) {
        this.effectiveAmount = this.amount - overheal;
      } else {
        this.effectiveAmount = 0;
      }
    }
  }
}
