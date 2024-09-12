import _ from 'lodash';

import { CombatUnitType, ILogLine, WowVersion } from '../types';
import { getUnitType } from '../utils';
import { CombatAction } from './CombatAction';

export class CombatSupportAction extends CombatAction {
  public static supports(logLine: ILogLine): boolean {
    return (
      super.supports(logLine) &&
      (logLine.event === 'SPELL_DAMAGE_SUPPORT' ||
        logLine.event === 'SPELL_PERIODIC_DAMAGE_SUPPORT' ||
        logLine.event === 'SPELL_HEAL_SUPPORT' ||
        logLine.event === 'SPELL_PERIODIC_HEAL_SUPPORT' ||
        logLine.event === 'RANGE_DAMAGE_SUPPORT' ||
        logLine.event === 'SWING_DAMAGE_SUPPORT' ||
        logLine.event === 'SWING_DAMAGE_LANDED_SUPPORT')
    );
  }

  /**
   * Support amounts represent the additional damage or healing caused by a buff or debuff
   *
   * This amount is already included in the _DAMAGE or _HEAL event of the source of the action
   */
  public readonly amount: number;
  public readonly isCritical: boolean;
  public readonly effectiveAmount: number;

  public readonly supportActorId: string;

  constructor(logLine: ILogLine, wowVersion: WowVersion) {
    super(logLine);
    if (!CombatSupportAction.supports(logLine)) {
      throw new Error('Event not supported as CombatSupportAction: ' + logLine.raw);
    }

    /**
     * For some god forsaken reason blizzard has decided that these _SUPPORT events will actually drop fields instead
     * of zeroing them in non-advanced logging modes. This means our prior strategy of just ingesting the zero/nil
     * fields won't work because it will crash with out of index errors. This is the only one I've seen in the new style
     * so I am just casing it out here.
     */
    if (logLine.event === 'SWING_DAMAGE_LANDED_SUPPORT' && logLine.parameters.length == 22) {
      this.amount = logLine.parameters[11];

      this.isCritical = false; // it's nil in the log
      if (getUnitType(this.destUnitFlags) === CombatUnitType.Player) {
        this.effectiveAmount = -this.amount;
      } else {
        this.effectiveAmount = 0;
      }
      this.supportActorId = logLine.parameters[21];
      return;
    }

    const wowVersionOffset = wowVersion === 'retail' ? 0 : -1;

    /**
     * The id of the actor that cast the buff causing the extra support damage or healing
     */
    if (logLine.event.includes('_HEAL_')) {
      this.supportActorId = logLine.parameters[33].toString();
    } else {
      this.supportActorId = logLine.parameters[38].toString();
    }

    if (logLine.event === 'SWING_DAMAGE_SUPPORT') {
      this.amount = -1 * logLine.parameters[25 + wowVersionOffset];
      this.isCritical = logLine.parameters[32 + wowVersionOffset] === 1;

      if (getUnitType(this.destUnitFlags) === CombatUnitType.Player) {
        this.effectiveAmount = this.amount;
      } else {
        this.effectiveAmount = 0;
      }
    } else if (logLine.event === 'SWING_DAMAGE_LANDED_SUPPORT') {
      this.amount = -1 * logLine.parameters[28 + wowVersionOffset];
      this.isCritical = logLine.parameters[35 + wowVersionOffset] === 1;

      if (getUnitType(this.destUnitFlags) === CombatUnitType.Player) {
        this.effectiveAmount = this.amount;
      } else {
        this.effectiveAmount = 0;
      }
    } else if (logLine.event.endsWith('_DAMAGE_SUPPORT')) {
      this.amount = -1 * logLine.parameters[28 + wowVersionOffset];
      this.isCritical = logLine.parameters[35 + wowVersionOffset] === 1;

      if (getUnitType(this.destUnitFlags) === CombatUnitType.Player) {
        this.effectiveAmount = this.amount;
      } else {
        this.effectiveAmount = 0;
      }
    } else {
      this.amount = logLine.parameters[28 + wowVersionOffset];
      const overheal = logLine.parameters[30 + wowVersionOffset] ?? 0;
      this.isCritical = logLine.parameters[32 + wowVersionOffset] === 1;

      if (getUnitType(this.destUnitFlags) === CombatUnitType.Player) {
        this.effectiveAmount = this.amount - overheal;
      } else {
        this.effectiveAmount = 0;
      }
    }
  }
}
