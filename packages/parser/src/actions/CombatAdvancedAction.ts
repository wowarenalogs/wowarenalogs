import _ from 'lodash';

import { CombatUnitPowerType, ILogLine, WowVersion } from '../types';
import { CombatAction } from './CombatAction';

export interface ICombatUnitPower {
  type: CombatUnitPowerType;
  current: number;
  max: number;
}

export class CombatAdvancedAction extends CombatAction {
  public static supports(logLine: ILogLine): boolean {
    return (
      super.supports(logLine) &&
      (logLine.event === 'SPELL_DAMAGE' ||
        logLine.event === 'SPELL_PERIODIC_DAMAGE' ||
        logLine.event === 'SPELL_HEAL' ||
        logLine.event === 'SPELL_PERIODIC_HEAL' ||
        logLine.event === 'SPELL_ENERGIZE' ||
        logLine.event === 'SPELL_PERIODIC_ENERGIZE' ||
        logLine.event === 'RANGE_DAMAGE' ||
        logLine.event === 'SWING_DAMAGE' ||
        logLine.event === 'SWING_DAMAGE_LANDED' ||
        logLine.event === 'SPELL_CAST_SUCCESS')
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

  constructor(logLine: ILogLine, wowVersion: WowVersion) {
    super(logLine);
    if (!CombatAdvancedAction.supports(logLine)) {
      throw new Error('Event not supported as CombatAdvancedAction: ' + logLine.raw);
    }

    const advancedLoggingOffset = logLine.event.startsWith('SWING_') ? 8 : 11;

    this.advanced = logLine.parameters[advancedLoggingOffset] !== 0;
    this.advancedActorId = logLine.parameters[advancedLoggingOffset].toString();
    this.advancedOwnerId = logLine.parameters[advancedLoggingOffset + 1].toString();
    this.advancedActorCurrentHp = logLine.parameters[advancedLoggingOffset + 2];
    this.advancedActorMaxHp = logLine.parameters[advancedLoggingOffset + 3];

    const wowVersionOffset = wowVersion === 'retail' ? 2 : -1;

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
  }
}
