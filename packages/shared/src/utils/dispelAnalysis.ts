import { CombatExtraSpellAction, CombatUnitSpec, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import spellIdListsData from '../data/spellIdLists.json';
import spellsData from '../data/spells.json';
import { fmtTime, specToString } from './cooldowns';

export type DispelPriority = 'Critical' | 'High' | 'Medium' | 'Low';

type SpellEntry = { type: string; priority?: boolean };
const SPELLS = spellsData as Record<string, SpellEntry>;
const BIG_DEFENSIVE_IDS = new Set<string>(spellIdListsData.bigDefensiveSpellIds as string[]);
const EXTERNAL_DEFENSIVE_IDS = new Set<string>(spellIdListsData.externalDefensiveSpellIds as string[]);

const MISSED_CLEANSE_THRESHOLD_S = 3;

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

// Spells whose debuff is Poison/Curse type rather than Magic.
// Everything non-physical that isn't listed here is assumed to be Magic.
const POISON_CC_IDS = new Set([
  '2094', // Blind (Rogue)
  '19386', // Wyvern Sting (Hunter)
  '392957', // Wyvern Sting (TWW variant)
  '3408', // Crippling Poison
  '25810', // Wyvern Sting (BM variant)
]);

const CURSE_CC_IDS = new Set([
  '50259', // Dazed (Curse of Exhaustion baseline)
  '334275', // Curse of Exhaustion (SL+)
  '702', // Curse of Weakness
]);

// Specs that can remove each debuff type.
const MAGIC_REMOVERS = new Set<CombatUnitSpec>([
  CombatUnitSpec.Paladin_Holy,
  CombatUnitSpec.Priest_Discipline,
  CombatUnitSpec.Priest_Holy,
  CombatUnitSpec.Druid_Restoration, // Nature's Cure (always talented in arena)
  CombatUnitSpec.Shaman_Restoration, // Purify Spirit
  CombatUnitSpec.Monk_Mistweaver, // Detox (also removes Poison/Disease)
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
]);

type DispelType = 'Magic' | 'Poison' | 'Curse' | 'Disease';

function getDispelType(spellId: string): DispelType {
  if (POISON_CC_IDS.has(spellId)) return 'Poison';
  if (CURSE_CC_IDS.has(spellId)) return 'Curse';
  return 'Magic';
}

function buildTeamDispelTypes(friends: ICombatUnit[]): Set<DispelType> {
  const types = new Set<DispelType>();
  for (const unit of friends) {
    if (MAGIC_REMOVERS.has(unit.spec)) types.add('Magic');
    if (POISON_REMOVERS.has(unit.spec)) types.add('Poison');
    if (CURSE_REMOVERS.has(unit.spec)) types.add('Curse');
    if (DISEASE_REMOVERS.has(unit.spec)) types.add('Disease');
  }
  return types;
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
  dispelType: DispelType;
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

export interface IDispelSummary {
  /** Our team removed debuffs from our allies */
  allyCleanse: IDispelEvent[];
  /** Our team purged / spell-stole buffs from enemies */
  ourPurges: IDispelEvent[];
  /** Enemies stripped buffs from our team */
  hostilePurges: IDispelEvent[];
  missedCleanseWindows: IMissedCleanseWindow[];
  ccEfficiency: ICCEfficiencyStat[];
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

export function reconstructDispelSummary(
  friends: ICombatUnit[],
  enemies: ICombatUnit[],
  combat: { startTime: number },
): IDispelSummary {
  const friendlyIds = new Set(friends.map((u) => u.id));
  const enemyIds = new Set(enemies.map((u) => u.id));
  const teamDispelTypes = buildTeamDispelTypes(friends);
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

      // Skip physical-school spells (stuns: Kidney Shot, Cheap Shot, Leg Sweep, etc.)
      const schoolId = parseInt(aura.spellSchoolId ?? '0x1', 16);
      if (schoolId === 0x1) continue;

      const priority = getPriority(spellId);
      if (priority !== 'Critical' && priority !== 'High') continue;

      // Only flag if the team has someone capable of removing this debuff type
      const dispelType = getDispelType(spellId);
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
            dispelType: getDispelType(spellId),
            postCcDamage,
          });
        }
      }
    }
  }

  missedCleanseWindows.sort((a, b) => a.timeSeconds - b.timeSeconds);

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

  return { allyCleanse, ourPurges, hostilePurges, missedCleanseWindows, ccEfficiency };
}

export function formatDispelContextForAI(summary: IDispelSummary): string[] {
  const lines: string[] = [];
  const { allyCleanse, ourPurges, hostilePurges, missedCleanseWindows, ccEfficiency } = summary;

  lines.push('DISPEL ANALYSIS:');

  lines.push('  Friendly cleanses (debuffs removed from our allies):');
  if (allyCleanse.length === 0) {
    lines.push('    None recorded');
  } else {
    for (const d of allyCleanse) {
      const penalty = d.hasDispelPenalty ? ` ⚠ ${d.penaltyDescription}` : '';
      lines.push(
        `    ${fmtTime(d.timeSeconds)} — [${d.sourceSpec}] cleansed ${d.removedSpellName} from ${d.targetName} [${d.priority}]${penalty}`,
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

  const significantMissed = missedCleanseWindows.filter((w) => w.priority === 'Critical');
  lines.push('  Missed cleanse opportunities (Critical CC on ally lasting >3s, not broken by damage):');
  if (significantMissed.length === 0) {
    lines.push('    None detected');
  } else {
    for (const w of significantMissed) {
      const dmg = w.postCcDamage > 0 ? `, ${Math.round(w.postCcDamage / 1000)}k dmg followed` : '';
      lines.push(
        `    ${fmtTime(w.timeSeconds)} — ${w.targetName} was in ${w.spellName} [${w.dispelType}] for ${Math.round(w.durationSeconds)}s${dmg}`,
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

  return lines;
}
