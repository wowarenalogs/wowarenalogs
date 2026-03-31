import { AtomicArenaCombat, classMetadata, CombatUnitSpec, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { spellEffectData } from '../data/spellEffectData';

/** Only track cooldowns at or above this threshold */
const MIN_CD_SECONDS = 30;

/** Ignore available windows shorter than this (e.g. just before match ends) */
const GRACE_SECONDS = 3;

export interface ICooldownCast {
  timeSeconds: number;
}

export interface IAvailableWindow {
  fromSeconds: number;
  toSeconds: number;
  durationSeconds: number;
}

export interface IMajorCooldownInfo {
  spellId: string;
  spellName: string;
  tag: string;
  cooldownSeconds: number;
  casts: ICooldownCast[];
  /** Periods when the CD was available but the player did not use it */
  availableWindows: IAvailableWindow[];
  neverUsed: boolean;
}

/**
 * For a given unit, return all class-tagged major cooldowns (>= 30s) with
 * cast times and idle availability windows derived from the combat log.
 */
export function extractMajorCooldowns(unit: ICombatUnit, combat: AtomicArenaCombat): IMajorCooldownInfo[] {
  const matchStartMs = combat.startTime;
  const matchEndMs = combat.endTime;
  const matchDurationSeconds = (matchEndMs - matchStartMs) / 1000;

  const classData = classMetadata.find((c) => c.unitClass === unit.class);
  if (!classData) return [];

  // Keep only tagged spells with cooldown data >= MIN_CD_SECONDS
  const seen = new Set<string>();
  const majorSpells = classData.abilities.filter((spell) => {
    if (seen.has(spell.spellId)) return false;
    if (spell.tags.length === 0) return false;
    const effectData = spellEffectData[spell.spellId];
    if (!effectData) return false;
    const cd = effectData.cooldownSeconds ?? effectData.charges?.chargeCooldownSeconds ?? 0;
    if (cd < MIN_CD_SECONDS) return false;
    seen.add(spell.spellId);
    return true;
  });

  return majorSpells.map((spell) => {
    const effectData = spellEffectData[spell.spellId]!;
    const cooldownSeconds = effectData.cooldownSeconds ?? effectData.charges?.chargeCooldownSeconds ?? 0;

    const castEvents = unit.spellCastEvents.filter(
      (e) => e.spellId === spell.spellId && e.logLine.event === LogEvent.SPELL_CAST_SUCCESS,
    );

    const casts: ICooldownCast[] = castEvents
      .map((e) => ({ timeSeconds: (e.logLine.timestamp - matchStartMs) / 1000 }))
      .sort((a, b) => a.timeSeconds - b.timeSeconds);

    const availableWindows: IAvailableWindow[] = [];

    const pushWindow = (from: number, to: number) => {
      const duration = to - from;
      if (duration > GRACE_SECONDS) {
        availableWindows.push({ fromSeconds: from, toSeconds: to, durationSeconds: duration });
      }
    };

    if (casts.length === 0) {
      // Never used — available the entire match
      pushWindow(0, matchDurationSeconds);
    } else {
      // Window before first cast
      if (casts[0].timeSeconds > GRACE_SECONDS) {
        pushWindow(0, casts[0].timeSeconds);
      }
      // Windows between casts (and from last cast to match end)
      for (let i = 0; i < casts.length; i++) {
        const cdReadyAt = casts[i].timeSeconds + cooldownSeconds;
        const nextCastAt = i + 1 < casts.length ? casts[i + 1].timeSeconds : matchDurationSeconds;
        if (cdReadyAt < matchDurationSeconds - GRACE_SECONDS) {
          pushWindow(cdReadyAt, nextCastAt);
        }
      }
    }

    return {
      spellId: spell.spellId,
      spellName: spell.name,
      tag: spell.tags[0] as string,
      cooldownSeconds,
      casts,
      availableWindows,
      neverUsed: casts.length === 0,
    };
  });
}

/** Compute per-player incoming damage bucketed into 15-second intervals. */
export interface IDamageBucket {
  fromSeconds: number;
  toSeconds: number;
  totalDamage: number;
  targetName: string;
  targetSpec: string;
}

export function computePressureWindows(
  friendlyPlayers: ICombatUnit[],
  combat: AtomicArenaCombat,
  bucketSeconds = 15,
  topN = 5,
): IDamageBucket[] {
  const matchStartMs = combat.startTime;
  const matchDurationSeconds = (combat.endTime - matchStartMs) / 1000;
  const numBuckets = Math.ceil(matchDurationSeconds / bucketSeconds);

  const allBuckets: IDamageBucket[] = [];

  for (const player of friendlyPlayers) {
    const buckets = new Array<number>(numBuckets).fill(0);
    for (const action of player.damageIn) {
      const t = (action.logLine.timestamp - matchStartMs) / 1000;
      const idx = Math.min(Math.floor(t / bucketSeconds), numBuckets - 1);
      if (idx >= 0) buckets[idx] += Math.abs(action.effectiveAmount);
    }
    buckets.forEach((dmg, idx) => {
      if (dmg > 0) {
        allBuckets.push({
          fromSeconds: idx * bucketSeconds,
          toSeconds: Math.min((idx + 1) * bucketSeconds, matchDurationSeconds),
          totalDamage: dmg,
          targetName: player.name,
          targetSpec: specToString(player.spec),
        });
      }
    });
  }

  return allBuckets.sort((a, b) => b.totalDamage - a.totalDamage).slice(0, topN);
}

// ---------------------------------------------------------------------------
// Spec name helpers
// ---------------------------------------------------------------------------

export function specToString(spec: CombatUnitSpec): string {
  const map: Partial<Record<CombatUnitSpec, string>> = {
    [CombatUnitSpec.DeathKnight_Blood]: 'Blood Death Knight',
    [CombatUnitSpec.DeathKnight_Frost]: 'Frost Death Knight',
    [CombatUnitSpec.DeathKnight_Unholy]: 'Unholy Death Knight',
    [CombatUnitSpec.DemonHunter_Havoc]: 'Havoc Demon Hunter',
    [CombatUnitSpec.DemonHunter_Vengeance]: 'Vengeance Demon Hunter',
    [CombatUnitSpec.DemonHunter_Devourer]: 'Devoker Demon Hunter',
    [CombatUnitSpec.Druid_Balance]: 'Balance Druid',
    [CombatUnitSpec.Druid_Feral]: 'Feral Druid',
    [CombatUnitSpec.Druid_Guardian]: 'Guardian Druid',
    [CombatUnitSpec.Druid_Restoration]: 'Restoration Druid',
    [CombatUnitSpec.Hunter_BeastMastery]: 'Beast Mastery Hunter',
    [CombatUnitSpec.Hunter_Marksmanship]: 'Marksmanship Hunter',
    [CombatUnitSpec.Hunter_Survival]: 'Survival Hunter',
    [CombatUnitSpec.Mage_Arcane]: 'Arcane Mage',
    [CombatUnitSpec.Mage_Fire]: 'Fire Mage',
    [CombatUnitSpec.Mage_Frost]: 'Frost Mage',
    [CombatUnitSpec.Monk_BrewMaster]: 'Brewmaster Monk',
    [CombatUnitSpec.Monk_Windwalker]: 'Windwalker Monk',
    [CombatUnitSpec.Monk_Mistweaver]: 'Mistweaver Monk',
    [CombatUnitSpec.Paladin_Holy]: 'Holy Paladin',
    [CombatUnitSpec.Paladin_Protection]: 'Protection Paladin',
    [CombatUnitSpec.Paladin_Retribution]: 'Retribution Paladin',
    [CombatUnitSpec.Priest_Discipline]: 'Discipline Priest',
    [CombatUnitSpec.Priest_Holy]: 'Holy Priest',
    [CombatUnitSpec.Priest_Shadow]: 'Shadow Priest',
    [CombatUnitSpec.Rogue_Assassination]: 'Assassination Rogue',
    [CombatUnitSpec.Rogue_Outlaw]: 'Outlaw Rogue',
    [CombatUnitSpec.Rogue_Subtlety]: 'Subtlety Rogue',
    [CombatUnitSpec.Shaman_Elemental]: 'Elemental Shaman',
    [CombatUnitSpec.Shaman_Enhancement]: 'Enhancement Shaman',
    [CombatUnitSpec.Shaman_Restoration]: 'Restoration Shaman',
    [CombatUnitSpec.Warlock_Affliction]: 'Affliction Warlock',
    [CombatUnitSpec.Warlock_Demonology]: 'Demonology Warlock',
    [CombatUnitSpec.Warlock_Destruction]: 'Destruction Warlock',
    [CombatUnitSpec.Warrior_Arms]: 'Arms Warrior',
    [CombatUnitSpec.Warrior_Fury]: 'Fury Warrior',
    [CombatUnitSpec.Warrior_Protection]: 'Protection Warrior',
    [CombatUnitSpec.Evoker_Devastation]: 'Devastation Evoker',
    [CombatUnitSpec.Evoker_Preservation]: 'Preservation Evoker',
    [CombatUnitSpec.Evoker_Augmentation]: 'Augmentation Evoker',
  };
  return map[spec] ?? 'Unknown';
}

const HEALER_SPECS = new Set([
  CombatUnitSpec.Druid_Restoration,
  CombatUnitSpec.Monk_Mistweaver,
  CombatUnitSpec.Paladin_Holy,
  CombatUnitSpec.Priest_Discipline,
  CombatUnitSpec.Priest_Holy,
  CombatUnitSpec.Shaman_Restoration,
  CombatUnitSpec.Evoker_Preservation,
]);

export function isHealerSpec(spec: CombatUnitSpec): boolean {
  return HEALER_SPECS.has(spec);
}

/** Format seconds as m:ss string */
export function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
