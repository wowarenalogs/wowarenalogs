import {
  AtomicArenaCombat,
  CombatUnitReaction,
  CombatUnitType,
  getBurstDps,
  getEffectiveCombatDuration,
  ICombatUnit,
  LogEvent,
} from '@wowarenalogs/parser';
import _ from 'lodash';

import { ccSpellIds } from '../data/spellTags';
import { getDampeningPercentage } from './dampening';
import { Utils } from './utils';

export const TOP_DAMAGE_SPELL_COUNT = 8;

export interface ISpellDamage {
  spellId: string;
  amount: number;
}

export interface ICombatUnitStats {
  damageDone: number;
  // Overheal excluded, absorbDone included. Do not add absorbDone to it again.
  healingDone: number;
  absorbDone: number;
  supportDamageIn: number;
  damageDonePerSecond: number;
  healingDonePerSecond: number;
  absorbDonePerSecond: number;
  // Peak dps over a 3 second window.
  burstDamagePerSecond: number;
  deaths: number;
  diedAtSecond: number | null;
  interruptsDone: number;
  interruptsTaken: number;
  ccDoneInMilliseconds: number;
  ccTakenInMilliseconds: number;
  itemLevel: number;
  topDamageSpells: ISpellDamage[];
}

export interface ICombatStats {
  effectiveDurationInSeconds: number;
  dampening: number;
  units: Record<string, ICombatUnitStats>;
}

export function getCombatPlayers(combat: AtomicArenaCombat): ICombatUnit[] {
  return _.values(combat.units).filter(
    (u) =>
      u.type === CombatUnitType.Player &&
      (u.reaction === CombatUnitReaction.Friendly || u.reaction === CombatUnitReaction.Hostile),
  );
}

// Overlapping applications count once. With sourceUnitId, only that unit's auras count.
export function getTimeInCC(target: ICombatUnit, sourceUnitId?: string): number {
  let totalTimeInCC = 0;
  let ccStartTime = -1;
  let ccStack = 0;

  for (let i = 0; i < target.auraEvents.length; ++i) {
    const event = target.auraEvents[i];
    const spellId = event.spellId || '';
    if (!ccSpellIds.has(spellId)) {
      continue;
    }
    if (sourceUnitId !== undefined && event.srcUnitId !== sourceUnitId) {
      continue;
    }
    switch (event.logLine.event) {
      case LogEvent.SPELL_AURA_APPLIED:
        if (ccStartTime < 0) {
          ccStartTime = event.logLine.timestamp;
        }
        ccStack++;
        break;
      case LogEvent.SPELL_AURA_REMOVED:
        ccStack--;
        if (ccStack === 0) {
          totalTimeInCC += event.logLine.timestamp - ccStartTime;
          ccStartTime = -1;
        }
        break;
    }
  }

  return totalTimeInCC;
}

export function getTotalDamageDone(unit: ICombatUnit): number {
  return unit.damageOut.reduce((sum, action) => {
    return sum + Math.abs(action.effectiveAmount);
  }, 0);
}

export function getTotalAbsorbDone(unit: ICombatUnit): number {
  return unit.absorbsOut.reduce((sum, action) => {
    return sum + Math.abs(action.effectiveAmount);
  }, 0);
}

export function getTotalHealingDone(unit: ICombatUnit): number {
  const healed = unit.healOut.reduce((sum, action) => {
    if (action.logLine.event === 'SPELL_PERIODIC_HEAL' || action.logLine.event === 'SPELL_HEAL') {
      // TODO: the parser needs to give us more info about overhealing
      const healedAmount = action.logLine.parameters[30] - action.logLine.parameters[32];
      // Logs without advanced combat logging carry 'nil' here, which makes this NaN
      // and fails to serialize as a GraphQL Float.
      return sum + (Number.isFinite(healedAmount) ? healedAmount : 0);
    }
    return sum + Math.abs(action.effectiveAmount);
  }, 0);
  return healed + getTotalAbsorbDone(unit);
}

// Melee swings carry no spell id and are reported under '0'.
export function getTopDamageSpells(unit: ICombatUnit, count = TOP_DAMAGE_SPELL_COUNT): ISpellDamage[] {
  const groups = _.groupBy(
    unit.damageOut.filter((a) => a.effectiveAmount !== 0),
    (a) => a.spellId || '0',
  );
  return _.map(groups, (actions, spellId) => ({
    spellId,
    amount: Math.round(_.sum(actions.map((a) => Math.abs(a.effectiveAmount)))),
  }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, count);
}

export function computeCombatStats(combat: AtomicArenaCombat): ICombatStats {
  const players = getCombatPlayers(combat);
  // Rounded before the per-second figures are derived from it, so that a consumer
  // dividing a total by the published duration gets the published rate back. Floored
  // at one second: a combat ending before anyone lands a hit would divide by zero.
  const effectiveDurationInSeconds = _.round(Math.max(getEffectiveCombatDuration(combat), 1), 2);

  const units: Record<string, ICombatUnitStats> = {};
  players.forEach((player) => {
    const damageDone = getTotalDamageDone(player);
    const healingDone = getTotalHealingDone(player);
    const absorbDone = getTotalAbsorbDone(player);
    const firstDeathTimestamp = _.min(player.deathRecords.map((r) => r.timestamp));

    units[player.id] = {
      damageDone,
      healingDone,
      absorbDone,
      supportDamageIn: player.supportDamageIn.reduce((sum, action) => {
        return sum + Math.abs(action.effectiveAmount);
      }, 0),
      damageDonePerSecond: Math.round(damageDone / effectiveDurationInSeconds),
      healingDonePerSecond: Math.round(healingDone / effectiveDurationInSeconds),
      absorbDonePerSecond: Math.round(absorbDone / effectiveDurationInSeconds),
      burstDamagePerSecond: Math.round(getBurstDps([player])),
      deaths: player.deathRecords.length,
      diedAtSecond:
        firstDeathTimestamp === undefined ? null : _.round((firstDeathTimestamp - combat.startTime) / 1000, 2),
      interruptsDone: player.actionOut.filter((l) => l.logLine.event === LogEvent.SPELL_INTERRUPT).length,
      interruptsTaken: player.actionIn.filter((l) => l.logLine.event === LogEvent.SPELL_INTERRUPT).length,
      // Summed over every player, the caster included, as the report has always counted it.
      ccDoneInMilliseconds: _.sum(players.map((target) => getTimeInCC(target, player.id))),
      ccTakenInMilliseconds: getTimeInCC(player),
      itemLevel: Utils.getAverageItemLevel(player),
      topDamageSpells: getTopDamageSpells(player),
    };
  });

  return {
    effectiveDurationInSeconds,
    dampening: getDampeningPercentage(combat.startInfo.bracket, players, combat.endTime),
    units,
  };
}
