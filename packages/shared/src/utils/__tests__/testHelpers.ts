/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared factory helpers for unit tests.
 * All mock objects use `as unknown as X` casts because CombatAction et al.
 * are classes with readonly fields — plain-object stubs are sufficient for
 * the structural checks performed in utils code.
 */

import {
  CombatUnitAffiliation,
  CombatUnitClass,
  CombatUnitReaction,
  CombatUnitSpec,
  CombatUnitType,
  ICombatUnit,
  LogEvent,
} from '@wowarenalogs/parser';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

/** Minimal damage-taken event (CombatHpUpdateAction shape). */
export function makeDamageEvent(timestamp: number, amount: number, destUnitId = 'player-1'): AnyObj {
  return {
    logLine: { event: LogEvent.SPELL_DAMAGE, timestamp, parameters: [] },
    timestamp,
    effectiveAmount: amount,
    amount,
    advancedActorMaxHp: 500_000,
    advancedActorCurrentHp: 400_000,
    advancedActorPositionX: 0,
    advancedActorPositionY: 0,
    srcUnitId: 'enemy-1',
    srcUnitName: 'Enemy',
    destUnitId,
    destUnitName: 'Target',
    spellId: '1',
    spellName: 'TestSpell',
  };
}

/** Minimal SPELL_HEAL event (CombatHpUpdateAction shape). */
export function makeHealEvent(timestamp: number, srcUnitId: string, amount: number, overhealAmount = 0): AnyObj {
  return {
    logLine: { event: LogEvent.SPELL_HEAL, timestamp, parameters: [] },
    timestamp,
    amount,
    effectiveAmount: amount - overhealAmount,
    srcUnitId,
    srcUnitName: 'Healer',
    destUnitId: 'player-1',
    destUnitName: 'Target',
    spellId: '1',
    spellName: 'TestHeal',
    advancedActorMaxHp: 500_000,
    advancedActorCurrentHp: 400_000,
    advancedActorPositionX: 0,
    advancedActorPositionY: 0,
  };
}

/** Minimal SPELL_CAST_SUCCESS event (CombatAction shape). */
export function makeSpellCastEvent(
  spellId: string,
  timestamp: number,
  destUnitId: string,
  destUnitName = 'Target',
  srcUnitId = 'player-1',
  srcUnitName = 'Player',
): AnyObj {
  return {
    logLine: { event: LogEvent.SPELL_CAST_SUCCESS, timestamp, parameters: [] },
    timestamp,
    spellId,
    spellName: spellId,
    srcUnitId,
    srcUnitName,
    destUnitId,
    destUnitName,
    effectiveAmount: 0,
    advancedActorMaxHp: 0,
    advancedActorCurrentHp: 0,
    advancedActorPositionX: 0,
    advancedActorPositionY: 0,
  };
}

/** Minimal aura event (CombatAction shape). */
export function makeAuraEvent(
  event: LogEvent,
  spellId: string,
  timestamp: number,
  srcUnitId = 'enemy-1',
  destUnitId = 'player-1',
): AnyObj {
  return {
    logLine: { event, timestamp, parameters: [] },
    timestamp,
    spellId,
    spellName: spellId,
    srcUnitId,
    srcUnitName: 'Source',
    destUnitId,
    destUnitName: 'Target',
    effectiveAmount: 0,
    advancedActorMaxHp: 0,
    advancedActorCurrentHp: 0,
  };
}

/** Minimal CombatAdvancedAction (position + HP snapshot). */
export function makeAdvancedAction(
  timestamp: number,
  posX: number,
  posY: number,
  maxHp = 500_000,
  currentHp = 500_000,
): AnyObj {
  return {
    logLine: { event: LogEvent.SPELL_DAMAGE, timestamp, parameters: [] },
    timestamp,
    advancedActorPositionX: posX,
    advancedActorPositionY: posY,
    advancedActorMaxHp: maxHp,
    advancedActorCurrentHp: currentHp,
    advancedActorFacing: 0,
    advancedActorItemLevel: 450,
    advancedActorPowers: [],
    advancedActorId: 'unit-1',
    advancedOwnerId: '',
    spellId: null,
    spellName: null,
    srcUnitId: 'unit-1',
    srcUnitName: '',
    destUnitId: 'unit-1',
    destUnitName: '',
  };
}

/** Build a minimal ICombatUnit stub. */
export function makeUnit(
  id: string,
  overrides: {
    name?: string;
    spec?: CombatUnitSpec;
    class?: CombatUnitClass;
    reaction?: CombatUnitReaction;
    spellCastEvents?: AnyObj[];
    auraEvents?: AnyObj[];
    damageIn?: AnyObj[];
    healOut?: AnyObj[];
    advancedActions?: AnyObj[];
    info?: AnyObj | undefined;
  } = {},
): ICombatUnit {
  return {
    id,
    name: overrides.name ?? id,
    ownerId: '',
    isWellFormed: true,
    reaction: overrides.reaction ?? CombatUnitReaction.Friendly,
    affiliation: CombatUnitAffiliation.Mine,
    type: CombatUnitType.Player,
    class: overrides.class ?? CombatUnitClass.None,
    spec: overrides.spec ?? CombatUnitSpec.None,
    info: overrides.info as ICombatUnit['info'],
    damageIn: (overrides.damageIn ?? []) as ICombatUnit['damageIn'],
    damageOut: [],
    healIn: [],
    healOut: (overrides.healOut ?? []) as ICombatUnit['healOut'],
    absorbsIn: [],
    absorbsOut: [],
    absorbsDamaged: [],
    supportDamageIn: [],
    supportDamageOut: [],
    supportHealIn: [],
    supportHealOut: [],
    actionIn: [],
    actionOut: [],
    auraEvents: (overrides.auraEvents ?? []) as ICombatUnit['auraEvents'],
    spellCastEvents: (overrides.spellCastEvents ?? []) as ICombatUnit['spellCastEvents'],
    deathRecords: [],
    consciousDeathRecords: [],
    advancedActions: (overrides.advancedActions ?? []) as ICombatUnit['advancedActions'],
  };
}

/** Build a minimal AtomicArenaCombat-compatible combat object. */
export function makeCombat(startTime: number, endTime: number): { startTime: number; endTime: number } {
  return { startTime, endTime };
}
