import { CombatExtraSpellAction, CombatUnitSpec, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { spellEffectData } from '../data/spellEffectData';
import spellIdListsData from '../data/spellIdLists.json';
import spellsData from '../data/spells.json';
import { fmtTime, specToString } from './cooldowns';
import { getPlayerTalentedSpellIds, getSpecTalentTreeSpellIds } from './talents';

export type DispelPriority = 'Critical' | 'High' | 'Medium' | 'Low';

type SpellEntry = { type: string; priority?: boolean };
const SPELLS = spellsData as Record<string, SpellEntry>;
const BIG_DEFENSIVE_IDS = new Set<string>(spellIdListsData.bigDefensiveSpellIds as string[]);
const EXTERNAL_DEFENSIVE_IDS = new Set<string>(spellIdListsData.externalDefensiveSpellIds as string[]);

const MISSED_CLEANSE_THRESHOLD_S = 3;
const MISSED_PURGE_THRESHOLD_S = 3;
const PENALTY_WINDOW_MS = 4000;

// Seconds after CC application to measure incoming damage for post-CC pressure weighting
const POST_CC_PRESSURE_WINDOW_S = 5;

// Spells that silence + damage the dispeller when removed.
// Only Unstable Affliction reliably has this mechanic in current WoW (TWW).
// VT dispel-damage was removed in Legion; Flame Shock has no dispel penalty.
// IDs 316099 and 342938 are confirmed present in BigDebuffs data for TWW.
const DISPEL_PENALTY_SPELLS = new Map<string, string>([
  ['316099', 'Silences & damages the dispeller (Unstable Affliction)'],
  ['342938', 'Silences & damages the dispeller (Unstable Affliction)'],
]);

// Specs that can remove each debuff type.
const MAGIC_REMOVERS = new Set<CombatUnitSpec>([
  CombatUnitSpec.Paladin_Holy,
  CombatUnitSpec.Priest_Discipline,
  CombatUnitSpec.Priest_Holy,
  CombatUnitSpec.Druid_Restoration, // Nature's Cure (always talented in arena)
  CombatUnitSpec.Shaman_Restoration, // Purify Spirit
  CombatUnitSpec.Monk_Mistweaver, // Detox (also removes Poison/Disease)
  CombatUnitSpec.Evoker_Preservation, // Naturalize
]);

// Poison: all Paladins, all Druids, all Monks
const POISON_REMOVERS = new Set<CombatUnitSpec>([
  CombatUnitSpec.Paladin_Holy,
  CombatUnitSpec.Paladin_Protection,
  CombatUnitSpec.Paladin_Retribution,
  CombatUnitSpec.Druid_Balance,
  CombatUnitSpec.Druid_Feral,
  CombatUnitSpec.Druid_Guardian,
  CombatUnitSpec.Druid_Restoration,
  CombatUnitSpec.Monk_Mistweaver,
  CombatUnitSpec.Monk_Windwalker,
  CombatUnitSpec.Monk_BrewMaster,
  CombatUnitSpec.Evoker_Preservation, // Naturalize / Expunge / Cauterizing Flame
  CombatUnitSpec.Evoker_Devastation, // Expunge / Cauterizing Flame
  CombatUnitSpec.Evoker_Augmentation, // Expunge / Cauterizing Flame
]);

// Curse: all Druids, all Mages, Resto Shaman
const CURSE_REMOVERS = new Set<CombatUnitSpec>([
  CombatUnitSpec.Druid_Balance,
  CombatUnitSpec.Druid_Feral,
  CombatUnitSpec.Druid_Guardian,
  CombatUnitSpec.Druid_Restoration,
  CombatUnitSpec.Mage_Arcane,
  CombatUnitSpec.Mage_Fire,
  CombatUnitSpec.Mage_Frost,
  CombatUnitSpec.Shaman_Restoration,
  CombatUnitSpec.Evoker_Preservation, // Cauterizing Flame
  CombatUnitSpec.Evoker_Devastation, // Cauterizing Flame
  CombatUnitSpec.Evoker_Augmentation, // Cauterizing Flame
]);

// Disease: all Paladins, Holy/Disc Priest, all Monks
const DISEASE_REMOVERS = new Set<CombatUnitSpec>([
  CombatUnitSpec.Paladin_Holy,
  CombatUnitSpec.Paladin_Protection,
  CombatUnitSpec.Paladin_Retribution,
  CombatUnitSpec.Priest_Discipline,
  CombatUnitSpec.Priest_Holy,
  CombatUnitSpec.Monk_Mistweaver,
  CombatUnitSpec.Monk_Windwalker,
  CombatUnitSpec.Monk_BrewMaster,
  CombatUnitSpec.Evoker_Preservation, // Cauterizing Flame
  CombatUnitSpec.Evoker_Devastation, // Cauterizing Flame
  CombatUnitSpec.Evoker_Augmentation, // Cauterizing Flame
]);

// Bleed: Evokers
const BLEED_REMOVERS = new Set<CombatUnitSpec>([
  CombatUnitSpec.Evoker_Preservation, // Cauterizing Flame
  CombatUnitSpec.Evoker_Devastation, // Cauterizing Flame
  CombatUnitSpec.Evoker_Augmentation, // Cauterizing Flame
]);

// Specs capable of removing Magic buffs from enemies (offensive dispel / spellsteal / devour)
const OFFENSIVE_PURGERS = new Set<CombatUnitSpec>([
  CombatUnitSpec.Priest_Discipline, // Dispel Magic (offensive target)
  CombatUnitSpec.Priest_Holy, // Dispel Magic (offensive target)
  CombatUnitSpec.Priest_Shadow, // Dispel Magic (offensive target)
  CombatUnitSpec.Shaman_Restoration, // Purge
  CombatUnitSpec.Shaman_Elemental, // Purge
  CombatUnitSpec.Shaman_Enhancement, // Purge
  CombatUnitSpec.Mage_Arcane, // Spellsteal
  CombatUnitSpec.Mage_Fire, // Spellsteal
  CombatUnitSpec.Mage_Frost, // Spellsteal
  CombatUnitSpec.DemonHunter_Havoc, // Consume Magic
  CombatUnitSpec.DemonHunter_Vengeance, // Consume Magic
  CombatUnitSpec.Warlock_Affliction, // Devour Magic (Felhunter)
  CombatUnitSpec.Warlock_Demonology, // Devour Magic (Felhunter)
  CombatUnitSpec.Warlock_Destruction, // Devour Magic (Felhunter)
]);

// Purge specs whose purge ability has a meaningful cooldown (>= 8s).
// For these, only flag Critical priority missed purges — they can't freely spam purge
// every GCD so holding the ability for a better target is often correct.
const CD_GATED_PURGERS = new Set<CombatUnitSpec>([
  CombatUnitSpec.Evoker_Preservation, // Naturalize: 10s CD
  CombatUnitSpec.Evoker_Devastation, // Naturalize: 10s CD
  CombatUnitSpec.Evoker_Augmentation, // Naturalize: 10s CD
  CombatUnitSpec.Warlock_Affliction, // Devour Magic: ~8s CD
  CombatUnitSpec.Warlock_Demonology,
  CombatUnitSpec.Warlock_Destruction,
  CombatUnitSpec.DemonHunter_Havoc, // Consume Magic: 8s CD
  CombatUnitSpec.DemonHunter_Vengeance,
]);

// Spell IDs that have Magic dispelType in the game DB but cannot actually be targeted
// by player offensive purge abilities in practice. Covers three categories:
//   1. Immunity shells — target is spell-immune while active, so purge cannot land
//   2. Passive/visual auras — registered as Magic but not dispel-targetable
//   3. Cross-team targeting issues — buff is on your ally, not an enemy
const PURGE_BLOCKLIST = new Set<string>([
  // ── Immunity shells (target is spell-immune; purge cannot land) ──────────────────
  '642', // Divine Shield (Paladin) — full spell immunity while active
  '45438', // Ice Block (Mage) — full spell immunity while active
  '186265', // Aspect of the Turtle (Hunter) — full spell + attack immunity
  // ── Passive / visual auras — registered as Magic but not dispel-targetable ───────
  '188501', // Spectral Sight (DH) — passive/visual, not purgeable
  '132158', // Nature's Swiftness — instant-cast buff, expires before purge lands
  // ── Cross-team targeting issues ──────────────────────────────────────────────────
  '29166', // Innervate — targeted at an ally, not an enemy; removed by defensive cleanse
  '605', // Mind Control — debuff on your ally, removed via defensive cleanse not offensive purge
]);

type DispelType = 'Magic' | 'Poison' | 'Curse' | 'Disease' | 'Bleed';

// DH Consume Magic is in the TWW talent tree — only available if the player took the node.
const CONSUME_MAGIC_SPELL_ID = '278326';
// Warlock Felhunter: Summon Felhunter is in the talent tree; Devour Magic is a pet ability (not player talent).
// We use the Summon Felhunter talent as a proxy, falling back to cast evidence.
const SUMMON_FELHUNTER_SPELL_ID = '30146';
// Shadow Priest: Purify Disease is in the talent tree (not baseline like Holy/Disc).
const PURIFY_DISEASE_SPELL_ID = '213634';

const WARLOCK_SPECS = new Set<CombatUnitSpec>([
  CombatUnitSpec.Warlock_Affliction,
  CombatUnitSpec.Warlock_Demonology,
  CombatUnitSpec.Warlock_Destruction,
]);
const DH_SPECS = new Set<CombatUnitSpec>([CombatUnitSpec.DemonHunter_Havoc, CombatUnitSpec.DemonHunter_Vengeance]);

/** Returns the set of spell IDs the unit successfully cast during the match. */
function unitCastSpellIds(unit: ICombatUnit): Set<string> {
  return new Set<string>(
    unit.spellCastEvents
      .filter((e) => e.logLine.event === LogEvent.SPELL_CAST_SUCCESS)
      .map((e) => e.spellId)
      .filter((id): id is string => id !== null),
  );
}

/**
 * Returns true if a talent-gated spell is confirmed available for the unit.
 * - Has talent data and took the talent → true
 * - Has talent data and didn't take it → false
 * - No talent data + has COMBATANT_INFO → fall back to cast evidence
 * - No COMBATANT_INFO at all → false (can't verify; avoid false positives)
 */
function hasTalentedAbility(unit: ICombatUnit, spellId: string): boolean {
  const specIdNum = parseInt(unit.spec, 10);
  const talentTreeIds = getSpecTalentTreeSpellIds(specIdNum);
  if (!talentTreeIds.has(spellId)) return false; // not a talent for this spec

  const talentedIds = unit.info?.talents ? getPlayerTalentedSpellIds(specIdNum, unit.info.talents) : null;
  if (talentedIds !== null) return talentedIds.has(spellId);

  // No parsed talent data — use cast evidence if COMBATANT_INFO was present
  if (unit.info !== undefined) return unitCastSpellIds(unit).has(spellId);

  return false; // no COMBATANT_INFO — can't verify
}

/**
 * Returns true if the unit can defensively cleanse the given debuff type from an ally,
 * accounting for talent-gated abilities (e.g. Shadow Priest Purify Disease).
 *
 * Note: Warlock Imp Singe Magic (party magic cleanse) is not tracked — it is a pet
 * ability with no reliable signal in player cast events.
 */
export function canDefensiveCleanse(unit: ICombatUnit, dispelType: DispelType): boolean {
  switch (dispelType) {
    case 'Magic':
      return MAGIC_REMOVERS.has(unit.spec);
    case 'Poison':
      return POISON_REMOVERS.has(unit.spec);
    case 'Curse':
      return CURSE_REMOVERS.has(unit.spec);
    case 'Disease':
      if (DISEASE_REMOVERS.has(unit.spec)) return true;
      // Shadow Priest can talent into Purify Disease — not in DISEASE_REMOVERS by default
      if (unit.spec === CombatUnitSpec.Priest_Shadow) return hasTalentedAbility(unit, PURIFY_DISEASE_SPELL_ID);
      return false;
    case 'Bleed':
      return BLEED_REMOVERS.has(unit.spec);
  }
}

/**
 * Returns true if the unit can actually perform an offensive purge, accounting for
 * talent gating (DH Consume Magic) and pet requirements (Warlock Felhunter).
 */
export function canOffensivePurge(unit: ICombatUnit): boolean {
  if (!OFFENSIVE_PURGERS.has(unit.spec)) return false;

  const specIdNum = parseInt(unit.spec, 10);
  const talentTreeIds = getSpecTalentTreeSpellIds(specIdNum);
  const talentedIds = unit.info?.talents ? getPlayerTalentedSpellIds(specIdNum, unit.info.talents) : null;
  const hasCombatantInfo = unit.info !== undefined;
  const castSpellIds = unitCastSpellIds(unit);

  // DH: Consume Magic is talent-gated.
  if (DH_SPECS.has(unit.spec) && talentTreeIds.has(CONSUME_MAGIC_SPELL_ID)) {
    if (talentedIds !== null && !talentedIds.has(CONSUME_MAGIC_SPELL_ID)) return false;
    if (talentedIds === null && hasCombatantInfo && !castSpellIds.has(CONSUME_MAGIC_SPELL_ID)) return false;
  }

  // Warlock: Devour Magic requires an active Felhunter pet.
  // Summon Felhunter (30146) is in the talent tree; if the player has talent data and didn't
  // take it, they likely have a different pet. Fall back to cast evidence for the summon.
  if (WARLOCK_SPECS.has(unit.spec)) {
    if (talentTreeIds.has(SUMMON_FELHUNTER_SPELL_ID)) {
      if (talentedIds !== null && !talentedIds.has(SUMMON_FELHUNTER_SPELL_ID)) {
        // Didn't take Summon Felhunter talent — check cast evidence as final fallback
        // (they may have summoned it before the match started, so cast may not appear)
        if (!castSpellIds.has(SUMMON_FELHUNTER_SPELL_ID)) return false;
      }
    }
  }

  return true;
}

/**
 * Fallback dispel types for CC spells whose game DB dispelType is null but are confirmed
 * Magic-dispellable in practice. Keep this list SMALL and conservative — only add entries
 * you have personally verified as dispellable in the current patch. When in doubt, leave it
 * out: a false negative (missed report) is better than a false positive (wrong report).
 *
 * Do NOT add: physical stuns (Kidney Shot, Cheap Shot, Leg Sweep, Storm Bolt, Consecutive
 * Concussion), silences (Solar Beam, Sigil of Silence), or talent modifier spells.
 */
const DISPEL_TYPE_FALLBACK: Record<string, DispelType> = {
  // Rogue
  '2094': 'Magic', // Blind — confirmed Magic-dispellable
  // Monk
  '115078': 'Magic', // Paralysis — confirmed Magic-dispellable
  '107079': 'Magic', // Quaking Palm — confirmed Magic-dispellable
  // Hunter
  '203337': 'Magic', // Freezing Trap — confirmed Magic-dispellable
  // Warrior
  '5246': 'Magic', // Intimidating Shout — confirmed Magic-dispellable (fear)
  '316593': 'Magic', // Intimidating Shout (rank 2)
  '316595': 'Magic', // Intimidating Shout (rank 3)
  // Priest
  '200196': 'Magic', // Holy Word: Chastise — confirmed Magic-dispellable
  '200200': 'Magic', // Holy Word: Chastise (rank 2)
  // Druid
  '99': 'Magic', // Incapacitating Roar — confirmed Magic-dispellable
};

/** Returns the dispel type for a spell ID from game data, or null if the spell cannot be dispelled. */
function getDispelType(spellId: string): DispelType | null {
  const type = spellEffectData[spellId]?.dispelType;
  if (type === 'Magic' || type === 'Poison' || type === 'Curse' || type === 'Disease' || type === 'Bleed') return type;
  // Fall back to our curated map for CC spells missing from spellEffects.json.
  return DISPEL_TYPE_FALLBACK[spellId] ?? null;
}

const ALL_DISPEL_TYPES: DispelType[] = ['Magic', 'Poison', 'Curse', 'Disease', 'Bleed'];

function buildTeamDispelTypes(friends: ICombatUnit[]): Set<DispelType> {
  const types = new Set<DispelType>();
  for (const unit of friends) {
    for (const type of ALL_DISPEL_TYPES) {
      if (canDefensiveCleanse(unit, type)) types.add(type);
    }
  }
  return types;
}

/** Returns which friendly units can remove each dispel type. */
function buildTeamDispelCapability(friends: ICombatUnit[]): Map<DispelType, ICombatUnit[]> {
  const map = new Map<DispelType, ICombatUnit[]>();
  const add = (type: DispelType, unit: ICombatUnit) => {
    const list = map.get(type) ?? [];
    list.push(unit);
    map.set(type, list);
  };
  for (const unit of friends) {
    for (const type of ALL_DISPEL_TYPES) {
      if (canDefensiveCleanse(unit, type)) add(type, unit);
    }
  }
  return map;
}

export interface IDispelEvent {
  timeSeconds: number;
  dispelSpellId: string;
  dispelSpellName: string;
  removedSpellId: string;
  removedSpellName: string;
  sourceName: string;
  sourceSpec: string;
  targetName: string;
  targetSpec: string;
  priority: DispelPriority;
  hasDispelPenalty: boolean;
  penaltyDescription?: string;
  /** Damage taken by the dispeller in the 4s after the dispel (only set when hasDispelPenalty) */
  penaltyDamageTaken?: number;
  /** Damage taken by the dispeller in the 4s before the dispel — baseline context */
  penaltyDamageBaseline?: number;
  isSpellSteal: boolean;
}

export interface IMissedCleanseWindow {
  timeSeconds: number;
  durationSeconds: number;
  targetName: string;
  targetSpec: string;
  spellName: string;
  spellId: string;
  priority: DispelPriority;
  dispelType: DispelType; // always set; null case is filtered before pushing
  /** Damage the target took in the first POST_CC_PRESSURE_WINDOW_S seconds after CC was applied */
  postCcDamage: number;
}

export interface ICCEfficiencyStat {
  targetName: string;
  targetSpec: string;
  /** Critical + High CC windows applied by enemies (that the team could have cleansed) */
  totalCCWindows: number;
  /** CC windows dispelled quickly (< threshold) or explicitly dispelled by a teammate */
  cleanseCount: number;
  /** CC windows that lasted > threshold without a friendly dispel */
  missedCount: number;
  /** CC windows that ended because of incoming damage (SPELL_AURA_BROKEN_SPELL), not dispelled */
  brokenCount: number;
  /** cleanseCount / (cleanseCount + missedCount), ignoring broken-by-damage windows */
  cleanseRate: number;
}

export interface IMissedPurgeWindow {
  timeSeconds: number;
  /** How long the buff sat uncontested; capped at match duration if never removed */
  durationSeconds: number;
  enemyName: string;
  enemySpec: string;
  spellName: string;
  spellId: string;
  priority: DispelPriority;
}

export interface IDispelSummary {
  /** Our team removed debuffs from our allies */
  allyCleanse: IDispelEvent[];
  /** Our team purged / spell-stole buffs from enemies */
  ourPurges: IDispelEvent[];
  /** Enemies stripped buffs from our team */
  hostilePurges: IDispelEvent[];
  missedCleanseWindows: IMissedCleanseWindow[];
  ccEfficiency: ICCEfficiencyStat[];
  /** Critical/High magic buffs on enemies that sat >3s while we had an offensive purger */
  missedPurgeWindows: IMissedPurgeWindow[];
}

function getPriority(spellId: string): DispelPriority {
  // WoW-flagged major defensives take precedence
  if (BIG_DEFENSIVE_IDS.has(spellId) || EXTERNAL_DEFENSIVE_IDS.has(spellId)) return 'Critical';

  const spell = SPELLS[spellId];
  if (!spell) return 'Low';

  switch (spell.type) {
    case 'cc':
    case 'immunities':
      return 'Critical';
    case 'roots':
    case 'immunities_spells':
    case 'buffs_offensive':
    case 'debuffs_offensive':
    case 'buffs_defensive':
      return 'High';
    case 'buffs_other':
      return 'Medium';
    default:
      return 'Low';
  }
}

/**
 * Returns true if the given CC windows (sorted by start) cover every millisecond of [start, end].
 */
function isWindowFullyCovered(ccWindows: Array<{ from: number; to: number }>, start: number, end: number): boolean {
  const relevant = ccWindows.filter((w) => w.from <= end && w.to >= start);
  if (relevant.length === 0) return false;
  relevant.sort((a, b) => a.from - b.from);
  let covered = start;
  for (const w of relevant) {
    if (w.from > covered) return false; // gap — purger was free
    covered = Math.max(covered, w.to);
    if (covered >= end) return true;
  }
  return covered >= end;
}

/**
 * Returns true if the unit was in hard CC (spell type 'cc') applied by enemies
 * for the ENTIRETY of [windowStartMs, windowEndMs].
 */
function isPurgerFullyBlockedDuringWindow(
  purger: ICombatUnit,
  windowStartMs: number,
  windowEndMs: number,
  enemyIds: Set<string>,
): boolean {
  const appliedTimes = new Map<string, number[]>();
  const removedTimes = new Map<string, number[]>();

  for (const aura of purger.auraEvents) {
    const spellId = aura.spellId;
    if (!spellId) continue;
    if (!enemyIds.has(aura.srcUnitId)) continue;
    const spell = SPELLS[spellId];
    if (!spell || spell.type !== 'cc') continue;

    if (aura.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
      const bucket = appliedTimes.get(spellId) ?? [];
      appliedTimes.set(spellId, [...bucket, aura.timestamp]);
    } else if (
      aura.logLine.event === LogEvent.SPELL_AURA_REMOVED ||
      aura.logLine.event === LogEvent.SPELL_AURA_BROKEN ||
      aura.logLine.event === LogEvent.SPELL_AURA_BROKEN_SPELL
    ) {
      const bucket = removedTimes.get(spellId) ?? [];
      removedTimes.set(spellId, [...bucket, aura.timestamp]);
    }
  }

  const ccWindows: Array<{ from: number; to: number }> = [];
  for (const [spellId, applications] of appliedTimes) {
    const removals = removedTimes.get(spellId) ?? [];
    for (const applyTs of applications) {
      const removalTs = removals.find((r) => r >= applyTs);
      ccWindows.push({ from: applyTs, to: removalTs ?? Infinity });
    }
  }

  return isWindowFullyCovered(ccWindows, windowStartMs, windowEndMs);
}

export function reconstructDispelSummary(
  friends: ICombatUnit[],
  enemies: ICombatUnit[],
  combat: { startTime: number; endTime: number },
): IDispelSummary {
  const friendlyIds = new Set(friends.map((u) => u.id));
  const enemyIds = new Set(enemies.map((u) => u.id));
  const teamDispelTypes = buildTeamDispelTypes(friends);
  const teamDispelCapability = buildTeamDispelCapability(friends);
  const unitMap = new Map<string, ICombatUnit>([...friends, ...enemies].map((u) => [u.id, u]));

  const allyCleanse: IDispelEvent[] = [];
  const ourPurges: IDispelEvent[] = [];
  const hostilePurges: IDispelEvent[] = [];

  for (const unit of [...friends, ...enemies]) {
    for (const action of unit.actionOut) {
      const isDispel = action.logLine.event === LogEvent.SPELL_DISPEL;
      const isSteal = action.logLine.event === LogEvent.SPELL_STOLEN;
      if (!isDispel && !isSteal) continue;
      if (!(action instanceof CombatExtraSpellAction)) continue;

      const removedSpellId = action.extraSpellId;
      if (!removedSpellId) continue;

      const priority = getPriority(removedSpellId);
      const destUnit = unitMap.get(action.destUnitId);
      const penaltyDesc = DISPEL_PENALTY_SPELLS.get(removedSpellId);

      const event: IDispelEvent = {
        timeSeconds: (action.timestamp - combat.startTime) / 1000,
        dispelSpellId: action.spellId ?? '',
        dispelSpellName: action.spellName ?? '',
        removedSpellId,
        removedSpellName: action.extraSpellName,
        sourceName: unit.name,
        sourceSpec: specToString(unit.spec),
        targetName: action.destUnitName,
        targetSpec: destUnit ? specToString(destUnit.spec) : 'Unknown',
        priority,
        hasDispelPenalty: penaltyDesc !== undefined,
        penaltyDescription: penaltyDesc,
        isSpellSteal: isSteal,
      };

      const srcFriendly = friendlyIds.has(unit.id);
      const srcEnemy = enemyIds.has(unit.id);
      const destFriendly = friendlyIds.has(action.destUnitId);
      const destEnemy = enemyIds.has(action.destUnitId);

      if (srcFriendly && destFriendly) {
        // We cleansed a debuff off our ally
        if (penaltyDesc !== undefined) {
          // Measure backlash: damage to the dispeller in the window before and after
          const ts = action.timestamp;
          event.penaltyDamageTaken = unit.damageIn
            .filter((d) => d.logLine.timestamp >= ts && d.logLine.timestamp <= ts + PENALTY_WINDOW_MS)
            .reduce((sum, d) => sum + Math.abs(d.effectiveAmount), 0);
          event.penaltyDamageBaseline = unit.damageIn
            .filter((d) => d.logLine.timestamp >= ts - PENALTY_WINDOW_MS && d.logLine.timestamp < ts)
            .reduce((sum, d) => sum + Math.abs(d.effectiveAmount), 0);
        }
        allyCleanse.push(event);
      } else if (srcFriendly && destEnemy) {
        // We purged / spell-stole a buff off an enemy
        ourPurges.push(event);
      } else if (srcEnemy && destFriendly) {
        // Enemy stripped a buff off us
        hostilePurges.push(event);
      }
    }
  }

  allyCleanse.sort((a, b) => a.timeSeconds - b.timeSeconds);
  ourPurges.sort((a, b) => a.timeSeconds - b.timeSeconds);
  hostilePurges.sort((a, b) => a.timeSeconds - b.timeSeconds);

  // Missed cleanse detection: Critical/High CC on friendly by enemy lasting > threshold without dispel.
  // SPELL_AURA_BROKEN_SPELL = broke from incoming damage (not a missed cleanse, the CC ended by other means).
  const missedCleanseWindows: IMissedCleanseWindow[] = [];

  // Efficiency tracking: per friendly unit, count CC windows and cleansed/missed
  const efficiencyMap = new Map<
    string,
    {
      targetName: string;
      targetSpec: string;
      totalCCWindows: number;
      cleanseCount: number;
      missedCount: number;
      brokenCount: number;
    }
  >();

  for (const unit of friends) {
    const appliedTimes = new Map<string, { ts: number; spellName: string }[]>();
    const removedTimes = new Map<string, { ts: number; brokenByDamage: boolean }[]>();

    for (const aura of unit.auraEvents) {
      const spellId = aura.spellId;
      if (!spellId) continue;

      // Only CC applied by enemies
      if (!enemyIds.has(aura.srcUnitId)) continue;

      const priority = getPriority(spellId);
      if (priority !== 'Critical' && priority !== 'High') continue;

      // Skip spells that cannot be dispelled (DispelType=None in game data)
      const dispelType = getDispelType(spellId);
      if (!dispelType) continue;

      // Only flag if the team has someone capable of removing this debuff type
      if (!teamDispelTypes.has(dispelType)) continue;

      if (aura.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
        const bucket = appliedTimes.get(spellId) ?? [];
        appliedTimes.set(spellId, [...bucket, { ts: aura.timestamp, spellName: aura.spellName ?? spellId }]);
      } else if (
        aura.logLine.event === LogEvent.SPELL_AURA_REMOVED ||
        aura.logLine.event === LogEvent.SPELL_AURA_BROKEN ||
        aura.logLine.event === LogEvent.SPELL_AURA_BROKEN_SPELL
      ) {
        const brokenByDamage = aura.logLine.event === LogEvent.SPELL_AURA_BROKEN_SPELL;
        const bucket = removedTimes.get(spellId) ?? [];
        removedTimes.set(spellId, [...bucket, { ts: aura.timestamp, brokenByDamage }]);
      }
    }

    // Ensure efficiency entry exists for this unit
    const effKey = unit.id;
    if (!efficiencyMap.has(effKey)) {
      efficiencyMap.set(effKey, {
        targetName: unit.name,
        targetSpec: specToString(unit.spec),
        totalCCWindows: 0,
        cleanseCount: 0,
        missedCount: 0,
        brokenCount: 0,
      });
    }
    const eff = efficiencyMap.get(effKey);
    if (!eff) continue;

    for (const [spellId, applications] of appliedTimes) {
      const priority = getPriority(spellId);
      const removals = removedTimes.get(spellId) ?? [];

      for (const { ts: applyTs, spellName } of applications) {
        const removal = removals.find((r) => r.ts >= applyTs);
        if (!removal) continue;

        eff.totalCCWindows++;

        const durationSeconds = (removal.ts - applyTs) / 1000;

        // CC broke from incoming damage — not a missed cleanse, but not a healer cleanse either
        if (removal.brokenByDamage) {
          eff.brokenCount++;
          continue;
        }

        if (durationSeconds < MISSED_CLEANSE_THRESHOLD_S) {
          eff.cleanseCount++;
          continue;
        }

        // Was removed by a friendly dispel near that removal time?
        const removedByDispel = allyCleanse.some(
          (d) =>
            d.removedSpellId === spellId &&
            d.targetName === unit.name &&
            Math.abs(d.timeSeconds - (removal.ts - combat.startTime) / 1000) < 0.5,
        );

        if (removedByDispel) {
          eff.cleanseCount++;
        } else {
          // dispelType is non-null here (null case is filtered above)
          const windowDispelType = getDispelType(spellId) as DispelType;

          // Skip if every capable dispeller was themselves CC'd for the entire window —
          // you can't dispel while hard-CC'd.
          const capableDispellers = teamDispelCapability.get(windowDispelType) ?? [];
          const allDispellersBlocked =
            capableDispellers.length > 0 &&
            capableDispellers.every((dispeller) =>
              isPurgerFullyBlockedDuringWindow(dispeller, applyTs, removal.ts, enemyIds),
            );
          if (allDispellersBlocked) {
            // Not a missed opportunity — no one could act
            continue;
          }

          eff.missedCount++;

          // Measure post-CC pressure: damage taken in first POST_CC_PRESSURE_WINDOW_S seconds
          const windowEndMs = applyTs + POST_CC_PRESSURE_WINDOW_S * 1000;
          const postCcDamage = unit.damageIn
            .filter((d) => d.logLine.timestamp >= applyTs && d.logLine.timestamp <= windowEndMs)
            .reduce((sum, d) => sum + Math.abs(d.effectiveAmount), 0);

          missedCleanseWindows.push({
            timeSeconds: (applyTs - combat.startTime) / 1000,
            durationSeconds,
            targetName: unit.name,
            targetSpec: specToString(unit.spec),
            spellName,
            spellId,
            priority,
            dispelType: windowDispelType,
            postCcDamage,
          });
        }
      }
    }
  }

  missedCleanseWindows.sort((a, b) => a.timeSeconds - b.timeSeconds);

  // Missed offensive purge detection: Critical/High magic buffs on enemies that sat >threshold
  // without being purged, when our team had the capability to purge.
  const missedPurgeWindows: IMissedPurgeWindow[] = [];
  const friendlyPurgers = friends.filter((f) => canOffensivePurge(f));

  if (friendlyPurgers.length > 0) {
    for (const enemy of enemies) {
      const appliedTimes = new Map<string, { ts: number; spellName: string }[]>();
      const removedTimes = new Map<string, number[]>();

      for (const aura of enemy.auraEvents) {
        const spellId = aura.spellId;
        if (!spellId) continue;
        // Only consider buffs applied by the enemy's own side — skip debuffs our team placed on them
        if (!enemyIds.has(aura.srcUnitId)) continue;
        if (getDispelType(spellId) !== 'Magic') continue;
        if (PURGE_BLOCKLIST.has(spellId)) continue;
        const priority = getPriority(spellId);
        if (priority !== 'Critical' && priority !== 'High') continue;

        if (aura.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
          const bucket = appliedTimes.get(spellId) ?? [];
          appliedTimes.set(spellId, [...bucket, { ts: aura.timestamp, spellName: aura.spellName ?? spellId }]);
        } else if (
          aura.logLine.event === LogEvent.SPELL_AURA_REMOVED ||
          aura.logLine.event === LogEvent.SPELL_AURA_BROKEN ||
          aura.logLine.event === LogEvent.SPELL_AURA_BROKEN_SPELL
        ) {
          const bucket = removedTimes.get(spellId) ?? [];
          removedTimes.set(spellId, [...bucket, aura.timestamp]);
        }
      }

      for (const [spellId, applications] of appliedTimes) {
        const priority = getPriority(spellId);
        const removals = removedTimes.get(spellId) ?? [];

        for (const { ts: applyTs, spellName } of applications) {
          const removalTs = removals.find((r) => r >= applyTs);
          const durationSeconds = ((removalTs ?? combat.endTime) - applyTs) / 1000;

          if (durationSeconds < MISSED_PURGE_THRESHOLD_S) continue;

          // Was it actually purged by our team within this window?
          const applyRelative = (applyTs - combat.startTime) / 1000;
          const purgedByUs = ourPurges.some(
            (p) =>
              p.removedSpellId === spellId &&
              p.targetName === enemy.name &&
              p.timeSeconds >= applyRelative &&
              p.timeSeconds <= applyRelative + durationSeconds,
          );

          if (!purgedByUs) {
            // Only flag if at least one purger was free during the window AND
            // the priority meets the bar for that purger's spec (CD-gated purgers
            // only get flagged for Critical misses — they can't spam purge every GCD).
            const windowEndMs = removalTs ?? combat.endTime;
            const eligiblePurgers = friendlyPurgers.filter(
              (p) => priority === 'Critical' || !CD_GATED_PURGERS.has(p.spec),
            );
            const allPurgersBlocked =
              eligiblePurgers.length === 0 ||
              eligiblePurgers.every((purger) =>
                isPurgerFullyBlockedDuringWindow(purger, applyTs, windowEndMs, enemyIds),
              );
            if (!allPurgersBlocked) {
              missedPurgeWindows.push({
                timeSeconds: applyRelative,
                durationSeconds,
                enemyName: enemy.name,
                enemySpec: specToString(enemy.spec),
                spellName,
                spellId,
                priority,
              });
            }
          }
        }
      }
    }

    missedPurgeWindows.sort((a, b) => a.timeSeconds - b.timeSeconds);
  }

  const ccEfficiency: ICCEfficiencyStat[] = [...efficiencyMap.values()]
    .filter((e) => e.totalCCWindows > 0)
    .map((e) => {
      const dispelableWindows = e.cleanseCount + e.missedCount;
      return {
        ...e,
        // Rate only counts windows where dispel was possible (excludes broken-by-damage)
        cleanseRate: dispelableWindows > 0 ? e.cleanseCount / dispelableWindows : 1,
      };
    })
    .sort((a, b) => b.totalCCWindows - a.totalCCWindows);

  return { allyCleanse, ourPurges, hostilePurges, missedCleanseWindows, ccEfficiency, missedPurgeWindows };
}

export function formatDispelContextForAI(summary: IDispelSummary): string[] {
  const lines: string[] = [];
  const { allyCleanse, ourPurges, hostilePurges, missedCleanseWindows, ccEfficiency, missedPurgeWindows } = summary;

  lines.push('DISPEL ANALYSIS:');

  lines.push('  Friendly cleanses (debuffs removed from our allies):');
  if (allyCleanse.length === 0) {
    lines.push('    None recorded');
  } else {
    for (const d of allyCleanse) {
      let penaltyStr = '';
      if (d.hasDispelPenalty) {
        penaltyStr = ` ⚠ ${d.penaltyDescription}`;
        if (d.penaltyDamageTaken !== undefined && d.penaltyDamageBaseline !== undefined) {
          const post = Math.round(d.penaltyDamageTaken / 1000);
          const pre = Math.round(d.penaltyDamageBaseline / 1000);
          penaltyStr += ` — took ${post}k backlash (${pre}k baseline before dispel)`;
        }
      }
      lines.push(
        `    ${fmtTime(d.timeSeconds)} — [${d.sourceSpec}] cleansed ${d.removedSpellName} from ${d.targetName} [${d.priority}]${penaltyStr}`,
      );
    }
  }

  lines.push('  Our purges (buffs removed from enemies):');
  if (ourPurges.length === 0) {
    lines.push('    None recorded');
  } else {
    for (const d of ourPurges) {
      const type = d.isSpellSteal ? 'spell-stole' : 'purged';
      lines.push(
        `    ${fmtTime(d.timeSeconds)} — [${d.sourceSpec}] ${type} ${d.removedSpellName} from enemy [${d.priority}]`,
      );
    }
  }

  lines.push('  Enemy purges (our buffs stripped by enemies):');
  if (hostilePurges.length === 0) {
    lines.push('    None recorded');
  } else {
    for (const d of hostilePurges) {
      lines.push(
        `    ${fmtTime(d.timeSeconds)} — enemy [${d.sourceSpec}] stripped ${d.removedSpellName} from ${d.targetName} [${d.priority}]`,
      );
    }
  }

  // Show Critical (hard CC) and High (roots, offensive debuffs) missed cleanses.
  // High priority ones only shown if they lasted >5s or had meaningful damage, to reduce noise.
  const significantMissed = missedCleanseWindows.filter(
    (w) => w.priority === 'Critical' || (w.priority === 'High' && (w.durationSeconds > 5 || w.postCcDamage > 50_000)),
  );
  lines.push('  Missed cleanse opportunities (dispellable CC/debuff on ally lasting >3s, not broken by damage):');
  if (significantMissed.length === 0) {
    lines.push('    None detected');
  } else {
    for (const w of significantMissed) {
      const dmg = w.postCcDamage > 0 ? `, ${Math.round(w.postCcDamage / 1000)}k dmg followed` : '';
      lines.push(
        `    ${fmtTime(w.timeSeconds)} — ${w.targetName} [${w.targetSpec}] was in ${w.spellName} [${w.dispelType}, ${w.priority}] for ${Math.round(w.durationSeconds)}s${dmg}`,
      );
    }
  }

  if (ccEfficiency.length > 0) {
    lines.push('  CC cleanse efficiency (Critical/High CC applied to your team):');
    for (const e of ccEfficiency) {
      const dispelableWindows = e.cleanseCount + e.missedCount;
      const pct = dispelableWindows > 0 ? Math.round(e.cleanseRate * 100) : 100;
      const brokenStr = e.brokenCount > 0 ? `, ${e.brokenCount} broke from damage` : '';
      lines.push(
        `    ${e.targetName} (${e.targetSpec}): ${e.totalCCWindows} CC windows — ${e.cleanseCount} cleansed, ${e.missedCount} missed${brokenStr} (${pct}% cleanse rate)`,
      );
    }
  }

  const significantMissedPurges = missedPurgeWindows.filter((w) => w.priority === 'Critical' || w.priority === 'High');
  lines.push('  Missed offensive purge opportunities (Critical/High magic buffs on enemies lasting >3s):');
  if (significantMissedPurges.length === 0) {
    lines.push('    None detected');
  } else {
    for (const w of significantMissedPurges) {
      lines.push(
        `    ${fmtTime(w.timeSeconds)} — ${w.enemyName} [${w.enemySpec}] had ${w.spellName} for ${Math.round(w.durationSeconds)}s unpurged [${w.priority}]`,
      );
    }
  }

  return lines;
}
