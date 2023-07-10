import _ from 'lodash';

import { CombatUnitType, ILogLine, WowVersion } from '../types';
import { getUnitType } from '../utils';
import { CombatAction } from './CombatAction';
import { ICombatUnitPower } from './CombatAdvancedAction';

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

  public readonly advancedActorId: string;
  public readonly advancedOwnerId: string;
  public readonly advancedActorCurrentHp: number;
  public readonly advancedActorMaxHp: number;
  public readonly advancedActorPowers: ICombatUnitPower[];
  public readonly advancedActorPositionX: number;
  public readonly advancedActorPositionY: number;
  public readonly advancedActorFacing: number;
  public readonly advancedActorItemLevel: number;
  public readonly advanced: boolean;

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
      throw new Error('Event not supported as CombatAdvancedAction: ' + logLine.raw);
    }

    const advancedLoggingOffset = logLine.event.startsWith('SWING_') ? 8 : 11;

    this.advanced = logLine.parameters[advancedLoggingOffset] !== 0;
    this.advancedActorId = logLine.parameters[advancedLoggingOffset].toString();
    this.advancedOwnerId = logLine.parameters[advancedLoggingOffset + 1].toString();
    this.advancedActorCurrentHp = logLine.parameters[advancedLoggingOffset + 2];
    this.advancedActorMaxHp = logLine.parameters[advancedLoggingOffset + 3];

    const wowVersionOffset = wowVersion === 'retail' ? 0 : -1;

    const powerType = logLine.parameters[advancedLoggingOffset + wowVersionOffset + 8]
      .toString()
      .split('|')
      .map((v: string) => v);
    const currentPower = logLine.parameters[advancedLoggingOffset + wowVersionOffset + 9]
      .toString()
      .split('|')
      .map((v: string) => parseInt(v));
    const maxPower = logLine.parameters[advancedLoggingOffset + wowVersionOffset + 10]
      .toString()
      .split('|')
      .map((v: string) => parseInt(v));
    this.advancedActorPowers = _.range(0, powerType.length).map((i) => ({
      type: powerType[i],
      current: currentPower[i],
      max: maxPower[i],
    }));

    this.advancedActorPositionX = logLine.parameters[advancedLoggingOffset + wowVersionOffset + 12];
    this.advancedActorPositionY = logLine.parameters[advancedLoggingOffset + wowVersionOffset + 13];

    this.advancedActorFacing = logLine.parameters[advancedLoggingOffset + wowVersionOffset + 15];
    this.advancedActorItemLevel = logLine.parameters[advancedLoggingOffset + wowVersionOffset + 16];

    /**
     * The id of the actor that cast the buff causing the extra support damage or healing
     */
    if (logLine.event.includes('_HEAL_')) {
      this.supportActorId = logLine.parameters[advancedLoggingOffset + 22].toString();
    } else {
      this.supportActorId = logLine.parameters[advancedLoggingOffset + 27].toString();
    }

    if (logLine.event === 'SWING_DAMAGE_SUPPORT') {
      this.amount = -1 * logLine.parameters[25 + wowVersionOffset];
      this.isCritical = logLine.parameters[32 + wowVersionOffset] === 1;

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
