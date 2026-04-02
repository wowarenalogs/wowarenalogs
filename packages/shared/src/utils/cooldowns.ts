import { AtomicArenaCombat, classMetadata, CombatUnitSpec, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { spellEffectData } from '../data/spellEffectData';
import spellIdListsData from '../data/spellIdLists.json';
import { getPlayerTalentedSpellIds, getSpecTalentTreeSpellIds } from './talents';

const MAJOR_DEFENSIVE_IDS = new Set<string>(spellIdListsData.externalOrBigDefensiveSpellIds as string[]);

// All spells tagged 'Offensive' in classMetadata — used to detect active enemy burst windows
const OFFENSIVE_SPELL_IDS = new Set<string>(
  classMetadata.flatMap((cls) => cls.abilities.filter((a) => a.tags.includes('Offensive')).map((a) => a.spellId)),
);

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
  // Death Knight
  '55233': [CombatUnitSpec.DeathKnight_Blood], // Vampiric Blood
  '49028': [CombatUnitSpec.DeathKnight_Blood], // Dancing Rune Weapon
  '108199': [CombatUnitSpec.DeathKnight_Blood], // Gorefiend's Grasp
  '221562': [CombatUnitSpec.DeathKnight_Blood], // Asphyxiate (Blood)
  '51271': [CombatUnitSpec.DeathKnight_Frost], // Pillar of Frost
  '47568': [CombatUnitSpec.DeathKnight_Frost], // Empower Rune Weapon
  '279302': [CombatUnitSpec.DeathKnight_Frost], // Frostwyrm's Fury
  '196770': [CombatUnitSpec.DeathKnight_Frost], // Remorseless Winter
  '152279': [CombatUnitSpec.DeathKnight_Frost], // Breath of Sindragosa
  '42650': [CombatUnitSpec.DeathKnight_Unholy], // Army of the Dead
  '49206': [CombatUnitSpec.DeathKnight_Unholy], // Summon Gargoyle
  '220143': [CombatUnitSpec.DeathKnight_Unholy], // Apocalypse
  '108194': [CombatUnitSpec.DeathKnight_Unholy], // Asphyxiate (Unholy)
  // Evoker
  '375087': [CombatUnitSpec.Evoker_Devastation], // Dragonrage
  '363916': [CombatUnitSpec.Evoker_Devastation], // Obsidian Scales
  '359816': [CombatUnitSpec.Evoker_Preservation], // Dream Flight
  '363534': [CombatUnitSpec.Evoker_Preservation], // Rewind
  '370960': [CombatUnitSpec.Evoker_Preservation], // Emerald Communion
  '370537': [CombatUnitSpec.Evoker_Preservation], // Stasis
  '370665': [CombatUnitSpec.Evoker_Preservation], // Rescue
  '403631': [CombatUnitSpec.Evoker_Augmentation], // Breath of Eons
  '404977': [CombatUnitSpec.Evoker_Augmentation], // Time Skip
  '360828': [CombatUnitSpec.Evoker_Augmentation], // Blistering Scales
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

  const specIdNum = parseInt(unit.spec, 10);
  const specTalentTreeSpellIds = getSpecTalentTreeSpellIds(specIdNum);
  const talentedSpellIds = unit.info?.talents ? getPlayerTalentedSpellIds(specIdNum, unit.info.talents) : null;

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
    // If this spell is talent-gated and we have talent data, only include if the player took it
    if (
      specTalentTreeSpellIds.has(spell.spellId) &&
      talentedSpellIds !== null &&
      !talentedSpellIds.has(spell.spellId)
    ) {
      return false;
    }
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
  windowSeconds = 10,
  topN = 5,
): IDamageBucket[] {
  const matchStartMs = combat.startTime;
  const allSpikes: IDamageBucket[] = [];

  for (const player of friendlyPlayers) {
    const damageEvents = player.damageIn
      .map((a) => ({
        timeSec: (a.logLine.timestamp - matchStartMs) / 1000,
        amount: Math.abs(a.effectiveAmount),
      }))
      .sort((a, b) => a.timeSec - b.timeSec);

    // Two-pointer sliding window: O(n) — j only advances, windowDamage is updated incrementally
    let j = 0;
    let windowDamage = 0;
    for (let i = 0; i < damageEvents.length; i++) {
      while (j < damageEvents.length && damageEvents[j].timeSec <= damageEvents[i].timeSec + windowSeconds) {
        windowDamage += damageEvents[j].amount;
        j++;
      }
      allSpikes.push({
        fromSeconds: damageEvents[i].timeSec,
        toSeconds: damageEvents[i].timeSec + windowSeconds,
        totalDamage: windowDamage,
        targetName: player.name,
        targetSpec: specToString(player.spec),
      });
      // Remove the event at i as the left edge advances
      windowDamage -= damageEvents[i].amount;
    }
  }

  // Sort and deduplicate: keep only non-overlapping top-N spikes per target
  allSpikes.sort((a, b) => b.totalDamage - a.totalDamage);
  const distinctSpikes: IDamageBucket[] = [];
  for (const spike of allSpikes) {
    const overlaps = distinctSpikes.some(
      (s) =>
        s.targetName === spike.targetName &&
        Math.min(s.toSeconds, spike.toSeconds) - Math.max(s.fromSeconds, spike.fromSeconds) > 0,
    );
    if (!overlaps) {
      distinctSpikes.push(spike);
      if (distinctSpikes.length >= topN) break;
    }
  }

  return distinctSpikes;
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

// ---------------------------------------------------------------------------
// Friendly CD overlap detection
// ---------------------------------------------------------------------------

export interface IOverlapCast {
  spec: string;
  playerName: string;
  spellName: string;
  tag: string;
  castTimeSeconds: number;
}

export interface IFriendlyCDOverlapGroup {
  /** Earliest cast time in the group */
  timeSeconds: number;
  casts: IOverlapCast[];
  /** True if the overlap occurred inside or within 5s of a top pressure window */
  duringPressureSpike: boolean;
}

/**
 * Find groups of defensive cooldowns used by friendly players within `overlapWindowSeconds`
 * of each other. Groups with only one cast are excluded (no overlap).
 */
export function detectFriendlyCDOverlaps(
  friendlyPlayers: ICombatUnit[],
  combat: AtomicArenaCombat,
  pressureWindows: IDamageBucket[],
  overlapWindowSeconds = 3,
): IFriendlyCDOverlapGroup[] {
  // Collect all defensive casts across friendly players
  const allCasts: IOverlapCast[] = [];
  for (const player of friendlyPlayers) {
    const cds = extractMajorCooldowns(player, combat);
    for (const cd of cds) {
      if (cd.tag !== 'Defensive') continue;
      for (const cast of cd.casts) {
        allCasts.push({
          spec: specToString(player.spec),
          playerName: player.name,
          spellName: cd.spellName,
          tag: cd.tag,
          castTimeSeconds: cast.timeSeconds,
        });
      }
    }
  }

  allCasts.sort((a, b) => a.castTimeSeconds - b.castTimeSeconds);

  // Group casts that fall within overlapWindowSeconds of the group's anchor (first cast)
  const groups: IFriendlyCDOverlapGroup[] = [];
  let i = 0;
  while (i < allCasts.length) {
    const anchor = allCasts[i].castTimeSeconds;
    const group: IOverlapCast[] = [];
    let j = i;
    while (j < allCasts.length && allCasts[j].castTimeSeconds - anchor <= overlapWindowSeconds) {
      group.push(allCasts[j]);
      j++;
    }
    if (group.length >= 2) {
      const duringPressureSpike = pressureWindows.some((w) => anchor >= w.fromSeconds - 5 && anchor <= w.toSeconds + 5);
      groups.push({ timeSeconds: anchor, casts: group, duringPressureSpike });
    }
    i = j === i ? i + 1 : j;
  }

  return groups;
}

export function formatFriendlyCDOverlapsForContext(groups: IFriendlyCDOverlapGroup[]): string[] {
  const lines: string[] = [];
  lines.push('FRIENDLY DEFENSIVE CD OVERLAPS (multiple defensives within 3s of each other):');

  if (groups.length === 0) {
    lines.push('  No overlapping defensive cooldowns detected.');
    return lines;
  }

  for (const group of groups) {
    const spike = group.duringPressureSpike ? ' [DURING PRESSURE SPIKE]' : '';
    lines.push(`  At ${fmtTime(group.timeSeconds)}${spike}:`);
    for (const c of group.casts) {
      lines.push(`    - ${c.spec} (${c.playerName}) used ${c.spellName}`);
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Panic trading / major defensive overlap detection
// ---------------------------------------------------------------------------

/** Minimum seconds two defensive buffs must coexist on the same target to count as a true overlap */
const MIN_SIMULTANEOUS_SECONDS = 2;
/** Max cast gap to bother checking aura overlap — no major defensive lasts longer than this */
const MAX_CAST_GAP_FOR_OVERLAP_CHECK_S = 45;

/**
 * Find when a specific spell aura was applied to a unit, starting at or after `afterMs`.
 * Returns {from, to} in absolute ms, or null if no matching application is found.
 * `to` is Infinity when the aura was never removed.
 */
function getAuraDurationOnTarget(
  target: ICombatUnit,
  spellId: string,
  afterMs: number,
): { from: number; to: number } | null {
  const applications: number[] = [];
  const removals: number[] = [];

  for (const aura of target.auraEvents) {
    if (aura.spellId !== spellId) continue;
    if (aura.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
      applications.push(aura.timestamp);
    } else if (
      aura.logLine.event === LogEvent.SPELL_AURA_REMOVED ||
      aura.logLine.event === LogEvent.SPELL_AURA_BROKEN ||
      aura.logLine.event === LogEvent.SPELL_AURA_BROKEN_SPELL
    ) {
      removals.push(aura.timestamp);
    }
  }

  // Find the first application at or shortly after the cast (500ms grace for log jitter)
  const applyTs = applications.find((t) => t >= afterMs - 500);
  if (applyTs === undefined) return null;

  const removeTs = removals.find((r) => r > applyTs);
  return { from: applyTs, to: removeTs ?? Infinity };
}

export interface IOverlappedDefensive {
  /** Timestamp of the first cast */
  timeSeconds: number;
  /** Timestamp of the second cast */
  secondCastTimeSeconds: number;
  targetUnitId: string;
  targetName: string;
  firstCasterSpec: string;
  firstCasterName: string;
  firstSpellName: string;
  firstSpellId: string;
  secondCasterSpec: string;
  secondCasterName: string;
  secondSpellName: string;
  secondSpellId: string;
  /** How long both buffs were simultaneously active on the target */
  simultaneousSeconds: number;
}

/**
 * Detects when two different friendly players cast major defensives (from
 * `BIG_DEFENSIVE_IDS` | `EXTERNAL_DEFENSIVE_IDS`) whose actual buff durations
 * overlapped on the same target for >= MIN_SIMULTANEOUS_SECONDS.
 * Same-player double-casts are ignored.
 */
export function detectOverlappedDefensives(
  friends: ICombatUnit[],
  combat: { startTime: number },
): IOverlappedDefensive[] {
  const friendlyIds = new Set(friends.map((u) => u.id));
  const unitMap = new Map(friends.map((u) => [u.id, u]));

  const casts: Array<{
    timeSeconds: number;
    castMs: number;
    casterUnitId: string;
    casterName: string;
    casterSpec: string;
    spellId: string;
    spellName: string;
    targetUnitId: string;
    targetName: string;
  }> = [];

  for (const unit of friends) {
    for (const action of unit.actionOut) {
      if (action.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
      const spellId = action.spellId;
      if (!spellId || !MAJOR_DEFENSIVE_IDS.has(spellId)) continue;
      if (!friendlyIds.has(action.destUnitId)) continue;

      casts.push({
        timeSeconds: (action.timestamp - combat.startTime) / 1000,
        castMs: action.timestamp,
        casterUnitId: unit.id,
        casterName: unit.name,
        casterSpec: specToString(unit.spec),
        spellId,
        spellName: action.spellName ?? spellId,
        targetUnitId: action.destUnitId,
        targetName: action.destUnitName,
      });
    }
  }

  casts.sort((a, b) => a.timeSeconds - b.timeSeconds);

  const overlaps: IOverlappedDefensive[] = [];

  for (let i = 0; i < casts.length; i++) {
    const first = casts[i];
    const targetUnit = unitMap.get(first.targetUnitId);
    if (!targetUnit) continue;

    for (let j = i + 1; j < casts.length; j++) {
      const second = casts[j];
      if (second.timeSeconds - first.timeSeconds > MAX_CAST_GAP_FOR_OVERLAP_CHECK_S) break;
      if (first.targetUnitId !== second.targetUnitId) continue;
      if (first.casterUnitId === second.casterUnitId) continue;

      const durA = getAuraDurationOnTarget(targetUnit, first.spellId, first.castMs);
      const durB = getAuraDurationOnTarget(targetUnit, second.spellId, second.castMs);
      if (!durA || !durB) continue;

      const overlapMs = Math.max(0, Math.min(durA.to, durB.to) - Math.max(durA.from, durB.from));
      const simultaneousSeconds = overlapMs / 1000;
      if (simultaneousSeconds < MIN_SIMULTANEOUS_SECONDS) continue;

      overlaps.push({
        timeSeconds: first.timeSeconds,
        secondCastTimeSeconds: second.timeSeconds,
        targetUnitId: first.targetUnitId,
        targetName: first.targetName,
        firstCasterSpec: first.casterSpec,
        firstCasterName: first.casterName,
        firstSpellName: first.spellName,
        firstSpellId: first.spellId,
        secondCasterSpec: second.casterSpec,
        secondCasterName: second.casterName,
        secondSpellName: second.spellName,
        secondSpellId: second.spellId,
        simultaneousSeconds,
      });
    }
  }

  return overlaps;
}

export function formatOverlappedDefensivesForContext(overlaps: IOverlappedDefensive[]): string[] {
  const lines: string[] = [];
  lines.push('PANIC TRADING — MAJOR DEFENSIVE OVERLAPS (two buffs simultaneously active on the same target):');

  if (overlaps.length === 0) {
    lines.push('  None detected.');
    return lines;
  }

  for (const o of overlaps) {
    const sim = o.simultaneousSeconds.toFixed(1);
    lines.push(
      `  ⚠ Major Overlap: [${o.firstCasterSpec}] used ${o.firstSpellName} on ${o.targetName} (at ${fmtTime(o.timeSeconds)}), then [${o.secondCasterSpec}] used ${o.secondSpellName} (at ${fmtTime(o.secondCastTimeSeconds)}) — both active simultaneously for ${sim}s.`,
    );
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Panic press detection (defensive cast with no enemy offensive threat active)
// ---------------------------------------------------------------------------

/** Fraction of the target's max HP that constitutes meaningful pressure in a window */
const PANIC_PRESS_PRESSURE_PCT = 0.15;
/** Fallback when no advancedActions HP data is available for the target */
const PANIC_PRESS_DAMAGE_THRESHOLD_FALLBACK = 250_000;
const PANIC_PRESS_PRE_CAST_WINDOW_MS = 3_000;
const PANIC_PRESS_POST_CAST_WINDOW_MS = 4_000;
/** If an enemy offensive CD starts within this window after the cast, it was a valid pre-wall */
const ENEMY_BURST_POST_CAST_WINDOW_MS = 2_000;

export interface IPanicDefensive {
  timeSeconds: number;
  casterSpec: string;
  casterName: string;
  spellName: string;
  spellId: string;
  targetName: string;
  targetSpec: string;
}

/**
 * Returns true if the given unit has an Offensive-tagged spell active at `timestampMs`,
 * optionally filtered to only auras sourced from `requiredSourceIds`.
 * - Pass `null` for `requiredSourceIds` to allow any source (used for enemy self-buffs).
 * - Pass the `enemyIds` set to restrict to enemy-sourced auras (used for debuffs on friendlies).
 */
function hasOffensiveSpellActive(
  unit: ICombatUnit,
  timestampMs: number,
  requiredSourceIds: Set<string> | null,
): boolean {
  const applied = new Map<string, number[]>();
  const removed = new Map<string, number[]>();

  for (const aura of unit.auraEvents) {
    const spellId = aura.spellId;
    if (!spellId || !OFFENSIVE_SPELL_IDS.has(spellId)) continue;
    if (requiredSourceIds !== null && !requiredSourceIds.has(aura.srcUnitId)) continue;

    if (aura.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
      const b = applied.get(spellId) ?? [];
      applied.set(spellId, [...b, aura.timestamp]);
    } else if (
      aura.logLine.event === LogEvent.SPELL_AURA_REMOVED ||
      aura.logLine.event === LogEvent.SPELL_AURA_BROKEN ||
      aura.logLine.event === LogEvent.SPELL_AURA_BROKEN_SPELL
    ) {
      const b = removed.get(spellId) ?? [];
      removed.set(spellId, [...b, aura.timestamp]);
    }
  }

  for (const [spellId, applications] of applied) {
    const removals = removed.get(spellId) ?? [];
    for (const applyTs of applications) {
      if (applyTs > timestampMs) continue;
      const removeTs = removals.find((r) => r > applyTs);
      if (removeTs === undefined || removeTs > timestampMs) return true;
    }
  }
  return false;
}

/**
 * Derive the pressure threshold for a unit from its recorded max HP (15% of max HP).
 * Falls back to a flat 250k when no advanced HP data is available.
 */
export function getPressureThreshold(unit: ICombatUnit): number {
  if (unit.advancedActions.length === 0) return PANIC_PRESS_DAMAGE_THRESHOLD_FALLBACK;
  const maxHp = Math.max(...unit.advancedActions.map((a) => a.advancedActorMaxHp));
  return maxHp > 0 ? maxHp * PANIC_PRESS_PRESSURE_PCT : PANIC_PRESS_DAMAGE_THRESHOLD_FALLBACK;
}

/**
 * Returns true if an enemy offensive CD was activated within `windowMs` AFTER `castMs`.
 * Checks both enemy self-buffs (e.g. Combustion applied to the enemy) and offensive
 * debuffs applied to the target (e.g. Deathmark placed on the friendly target).
 * A match here means the defensive was a valid pre-wall, not a panic press.
 */
function offensiveThreatStartedAfter(
  target: ICombatUnit,
  enemies: ICombatUnit[],
  enemyIds: Set<string>,
  castMs: number,
  windowMs: number,
): boolean {
  const windowEnd = castMs + windowMs;

  for (const enemy of enemies) {
    for (const aura of enemy.auraEvents) {
      if (aura.logLine.event !== LogEvent.SPELL_AURA_APPLIED) continue;
      if (!aura.spellId || !OFFENSIVE_SPELL_IDS.has(aura.spellId)) continue;
      if (aura.timestamp > castMs && aura.timestamp <= windowEnd) return true;
    }
  }

  for (const aura of target.auraEvents) {
    if (aura.logLine.event !== LogEvent.SPELL_AURA_APPLIED) continue;
    if (!aura.spellId || !OFFENSIVE_SPELL_IDS.has(aura.spellId)) continue;
    if (!enemyIds.has(aura.srcUnitId)) continue;
    if (aura.timestamp > castMs && aura.timestamp <= windowEnd) return true;
  }

  return false;
}

/**
 * Detects major defensive casts where there is no sign of active enemy threat:
 * 1. No enemy has an Offensive-tagged self-buff active (e.g. Combustion, Recklessness)
 * 2. The defensive target has no Offensive-tagged debuff from an enemy (e.g. Deathmark, Colossus Smash)
 * 3. The target took < 250k damage in the 3 seconds immediately before the cast
 * 4. The target took < 250k damage in the 4 seconds immediately after the cast (pre-wall check)
 * 5. No enemy offensive CD was activated within 2 seconds after the cast (pre-wall check)
 *
 * All five conditions must be true to flag a panic press.
 */
export function detectPanicDefensives(
  friends: ICombatUnit[],
  enemies: ICombatUnit[],
  combat: { startTime: number },
): IPanicDefensive[] {
  const friendlyIds = new Set(friends.map((u) => u.id));
  const enemyIds = new Set(enemies.map((u) => u.id));
  const unitMap = new Map(friends.map((u) => [u.id, u]));
  const results: IPanicDefensive[] = [];

  for (const unit of friends) {
    for (const action of unit.actionOut) {
      if (action.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
      const spellId = action.spellId;
      if (!spellId || !MAJOR_DEFENSIVE_IDS.has(spellId)) continue;
      if (!friendlyIds.has(action.destUnitId)) continue;

      const castMs = action.timestamp;
      const castTimeSeconds = (castMs - combat.startTime) / 1000;
      const targetUnit = unitMap.get(action.destUnitId);

      // 1. Enemy self-buffs: Combustion, Recklessness, etc.
      if (enemies.some((e) => hasOffensiveSpellActive(e, castMs, null))) continue;

      // 2. Offensive debuffs on the target from enemies: Deathmark, Colossus Smash, etc.
      if (targetUnit && hasOffensiveSpellActive(targetUnit, castMs, enemyIds)) continue;

      // 3. Local pressure: raw damage to target in the 3s before this cast
      const pressureThreshold = targetUnit ? getPressureThreshold(targetUnit) : PANIC_PRESS_DAMAGE_THRESHOLD_FALLBACK;
      const preCastDamage = (targetUnit?.damageIn ?? [])
        .filter((d) => d.logLine.timestamp >= castMs - PANIC_PRESS_PRE_CAST_WINDOW_MS && d.logLine.timestamp < castMs)
        .reduce((sum, d) => sum + Math.abs(d.effectiveAmount), 0);
      if (preCastDamage >= pressureThreshold) continue;

      // 4. Post-cast pressure: if the target took significant damage in the 4s after, it was a pre-wall
      const postCastDamage = (targetUnit?.damageIn ?? [])
        .filter((d) => d.logLine.timestamp > castMs && d.logLine.timestamp <= castMs + PANIC_PRESS_POST_CAST_WINDOW_MS)
        .reduce((sum, d) => sum + Math.abs(d.effectiveAmount), 0);
      if (postCastDamage >= pressureThreshold) continue;

      // 5. Enemy burst started within 2s after the cast — valid pre-wall, not a panic
      if (
        targetUnit &&
        offensiveThreatStartedAfter(targetUnit, enemies, enemyIds, castMs, ENEMY_BURST_POST_CAST_WINDOW_MS)
      )
        continue;

      results.push({
        timeSeconds: castTimeSeconds,
        casterSpec: specToString(unit.spec),
        casterName: unit.name,
        spellName: action.spellName ?? spellId,
        spellId,
        targetName: action.destUnitName,
        targetSpec: targetUnit ? specToString(targetUnit.spec) : 'Unknown',
      });
    }
  }

  results.sort((a, b) => a.timeSeconds - b.timeSeconds);
  return results;
}

export function formatPanicDefensivesForContext(panics: IPanicDefensive[]): string[] {
  const lines: string[] = [];
  lines.push('PANIC PRESSES (major defensive used with no enemy offensive threat and target not under pressure):');

  if (panics.length === 0) {
    lines.push('  None detected.');
    return lines;
  }

  for (const p of panics) {
    lines.push(
      `  ⚠ Panic Press at ${fmtTime(p.timeSeconds)}: [${p.casterSpec}] used ${p.spellName} on ${p.targetName} [${p.targetSpec}] — no enemy offensive CDs or debuffs active, <250k incoming damage in prior 3s.`,
    );
  }

  return lines;
}
