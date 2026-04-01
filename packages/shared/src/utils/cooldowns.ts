import { AtomicArenaCombat, classMetadata, CombatUnitSpec, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { spellEffectData } from '../data/spellEffectData';

/** Only track cooldowns at or above this threshold */
const MIN_CD_SECONDS = 30;

/**
 * Spec-exclusive spells: if a spell ID appears here, it is only valid for the listed specs.
 * Any other spec that shares the same class will have this spell filtered out.
 * Covers all tagged (Offensive/Defensive/Control) spells in classMetadata that are
 * listed under a spec-specific comment block.
 */
const SPEC_EXCLUSIVE_SPELLS: Record<string, CombatUnitSpec[]> = {
  // Druid
  '102560': [CombatUnitSpec.Druid_Balance], // Incarnation: Chosen of Elune
  '194223': [CombatUnitSpec.Druid_Balance], // Celestial Alignment
  '102543': [CombatUnitSpec.Druid_Feral], // Incarnation: King of the Jungle
  '106839': [CombatUnitSpec.Druid_Feral], // Skull Bash
  '106951': [CombatUnitSpec.Druid_Feral], // Berserk
  '102558': [CombatUnitSpec.Druid_Guardian], // Incarnation: Guardian of Ursoc
  '18562': [CombatUnitSpec.Druid_Restoration], // Swiftmend
  '33891': [CombatUnitSpec.Druid_Restoration], // Incarnation: Tree of Life
  '102342': [CombatUnitSpec.Druid_Restoration], // Ironbark
  '236696': [CombatUnitSpec.Druid_Restoration], // Thorns
  // Monk
  '115203': [CombatUnitSpec.Monk_BrewMaster], // Fortifying Brew
  '122470': [CombatUnitSpec.Monk_Windwalker], // Touch of Karma
  '123904': [CombatUnitSpec.Monk_Windwalker], // Invoke Xuen, the White Tiger
  '137639': [CombatUnitSpec.Monk_Windwalker], // Storm, Earth, and Fire
  '201318': [CombatUnitSpec.Monk_Windwalker], // Fortifying Elixir
  '116849': [CombatUnitSpec.Monk_Mistweaver], // Life Cocoon
  // Paladin
  '498': [CombatUnitSpec.Paladin_Holy], // Divine Protection
  '6940': [CombatUnitSpec.Paladin_Holy], // Blessing of Sacrifice
  '199448': [CombatUnitSpec.Paladin_Holy], // Blessing of Sacrifice
  '210294': [CombatUnitSpec.Paladin_Holy], // Divine Favor
  '86659': [CombatUnitSpec.Paladin_Protection], // Guardian of Ancient Kings
  '337851': [CombatUnitSpec.Paladin_Protection], // Guardian of Ancient Kings
  '337852': [CombatUnitSpec.Paladin_Protection], // Reign of Ancient Kings
  '228049': [CombatUnitSpec.Paladin_Protection], // Guardian of the Forgotten Queen
  // Priest
  '33206': [CombatUnitSpec.Priest_Discipline], // Pain Suppression
  '47536': [CombatUnitSpec.Priest_Discipline], // Rapture
  '62618': [CombatUnitSpec.Priest_Discipline], // Power Word: Barrier
  '81782': [CombatUnitSpec.Priest_Discipline], // Power Word: Barrier
  '197871': [CombatUnitSpec.Priest_Discipline], // Dark Archangel
  '19236': [CombatUnitSpec.Priest_Holy], // Desperate Prayer
  '196762': [CombatUnitSpec.Priest_Holy], // Inner Focus
  '200183': [CombatUnitSpec.Priest_Holy], // Apotheosis
  '47585': [CombatUnitSpec.Priest_Shadow], // Dispersion
  '64044': [CombatUnitSpec.Priest_Shadow], // Psychic Horror
  // Warlock
  '113860': [CombatUnitSpec.Warlock_Affliction], // Dark Soul: Misery
  '113858': [CombatUnitSpec.Warlock_Destruction], // Dark Soul: Instability
  // Rogue
  '5277': [CombatUnitSpec.Rogue_Assassination], // Evasion
  '36554': [CombatUnitSpec.Rogue_Assassination], // Shadowstep
  '79140': [CombatUnitSpec.Rogue_Assassination], // Vendetta/Deathmark
  '1776': [CombatUnitSpec.Rogue_Outlaw], // Gouge
  '2094': [CombatUnitSpec.Rogue_Outlaw], // Blind
  '13750': [CombatUnitSpec.Rogue_Outlaw], // Adrenaline Rush
  '51690': [CombatUnitSpec.Rogue_Outlaw], // Killing Spree
  '121471': [CombatUnitSpec.Rogue_Subtlety], // Shadow Blades
  '185313': [CombatUnitSpec.Rogue_Subtlety], // Shadow Dance
  '185422': [CombatUnitSpec.Rogue_Subtlety], // Shadow Dance
  '207736': [CombatUnitSpec.Rogue_Subtlety], // Shadowy Duel
  '212182': [CombatUnitSpec.Rogue_Subtlety], // Smoke Bomb
  '213981': [CombatUnitSpec.Rogue_Subtlety], // Cold Blood
  // Shaman
  '191634': [CombatUnitSpec.Shaman_Elemental], // Stormkeeper
  '58875': [CombatUnitSpec.Shaman_Enhancement], // Spirit Walk
  '98008': [CombatUnitSpec.Shaman_Restoration], // Spirit Link Totem
  '204293': [CombatUnitSpec.Shaman_Restoration], // Spirit Link
  '204336': [CombatUnitSpec.Shaman_Restoration], // Grounding Totem
  // Mage
  '12042': [CombatUnitSpec.Mage_Arcane], // Arcane Power
  '205025': [CombatUnitSpec.Mage_Arcane], // Presence of Mind
  '190319': [CombatUnitSpec.Mage_Fire], // Combustion
  '12472': [CombatUnitSpec.Mage_Frost], // Icy Veins
  // Hunter
  '19574': [CombatUnitSpec.Hunter_BeastMastery], // Bestial Wrath
  '19386': [CombatUnitSpec.Hunter_BeastMastery], // Wyvern Sting
  '24394': [CombatUnitSpec.Hunter_BeastMastery], // Intimidation
  '19577': [CombatUnitSpec.Hunter_BeastMastery], // Intimidation
  '213691': [CombatUnitSpec.Hunter_Marksmanship], // Scatter Shot
  // Demon Hunter
  '211881': [CombatUnitSpec.DemonHunter_Havoc], // Fel Eruption
  '207684': [CombatUnitSpec.DemonHunter_Vengeance], // Sigil of Misery
};

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

  // Keep only tagged spells with cooldown data >= MIN_CD_SECONDS that belong to the owner's spec
  const seen = new Set<string>();
  const majorSpells = classData.abilities.filter((spell) => {
    if (seen.has(spell.spellId)) return false;
    if (spell.tags.length === 0) return false;
    const effectData = spellEffectData[spell.spellId];
    if (!effectData) return false;
    const cd = effectData.cooldownSeconds ?? effectData.charges?.chargeCooldownSeconds ?? 0;
    if (cd < MIN_CD_SECONDS) return false;
    const allowedSpecs = SPEC_EXCLUSIVE_SPELLS[spell.spellId];
    if (allowedSpecs && !allowedSpecs.includes(unit.spec)) return false;
    seen.add(spell.spellId);
    return true;
  });

  return majorSpells.flatMap((spell) => {
    const effectData = spellEffectData[spell.spellId];
    if (!effectData) return [];
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

    return [
      {
        spellId: spell.spellId,
        spellName: spell.name,
        tag: spell.tags[0] as string,
        cooldownSeconds,
        casts,
        availableWindows,
        neverUsed: casts.length === 0,
      },
    ];
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
