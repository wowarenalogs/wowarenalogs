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

// Spells whose debuff is Poison/Curse/Disease type rather than Magic.
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
// Magic: healers + specs with a dedicated magic dispel
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
  direction: 'friendly' | 'hostile';
  priority: DispelPriority;
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
}

export interface IDispelSummary {
  friendlyDispels: IDispelEvent[];
  hostileDispels: IDispelEvent[];
  missedCleanseWindows: IMissedCleanseWindow[];
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

  const friendlyDispels: IDispelEvent[] = [];
  const hostileDispels: IDispelEvent[] = [];

  for (const unit of [...friends, ...enemies]) {
    for (const action of unit.actionOut) {
      if (action.logLine.event !== LogEvent.SPELL_DISPEL) continue;
      if (!(action instanceof CombatExtraSpellAction)) continue;

      const removedSpellId = action.extraSpellId;
      if (!removedSpellId) continue;

      const priority = getPriority(removedSpellId);
      const destUnit = unitMap.get(action.destUnitId);

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
        direction: enemyIds.has(unit.id) && friendlyIds.has(action.destUnitId) ? 'hostile' : 'friendly',
        priority,
      };

      if (enemyIds.has(unit.id) && friendlyIds.has(action.destUnitId)) {
        hostileDispels.push(event);
      } else if (friendlyIds.has(unit.id)) {
        friendlyDispels.push(event);
      }
    }
  }

  friendlyDispels.sort((a, b) => a.timeSeconds - b.timeSeconds);
  hostileDispels.sort((a, b) => a.timeSeconds - b.timeSeconds);

  // Detect missed cleanses: Critical CC applied to a friendly by an enemy that lasted > threshold without being dispelled
  const missedCleanseWindows: IMissedCleanseWindow[] = [];

  for (const unit of friends) {
    // Group aura events by spellId
    const appliedTimes = new Map<string, { ts: number; spellName: string }[]>();
    const removedTimes = new Map<string, number[]>();

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

      // Only flag as missed cleanse if the team has someone who can remove this debuff type
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
        const bucket = removedTimes.get(spellId) ?? [];
        removedTimes.set(spellId, [...bucket, aura.timestamp]);
      }
    }

    for (const [spellId, applications] of appliedTimes) {
      const priority = getPriority(spellId);
      const removals = removedTimes.get(spellId) ?? [];

      for (const { ts: applyTs, spellName } of applications) {
        const removeTs = removals.find((t) => t >= applyTs);
        if (!removeTs) continue;

        const durationSeconds = (removeTs - applyTs) / 1000;
        if (durationSeconds < MISSED_CLEANSE_THRESHOLD_S) continue;

        // Was removed by a friendly dispel near that removal time?
        const removedByDispel = friendlyDispels.some(
          (d) =>
            d.removedSpellId === spellId &&
            d.targetName === unit.name &&
            Math.abs(d.timeSeconds - (removeTs - combat.startTime) / 1000) < 0.5,
        );

        if (!removedByDispel) {
          missedCleanseWindows.push({
            timeSeconds: (applyTs - combat.startTime) / 1000,
            durationSeconds,
            targetName: unit.name,
            targetSpec: specToString(unit.spec),
            spellName,
            spellId,
            priority,
            dispelType: getDispelType(spellId),
          });
        }
      }
    }
  }

  missedCleanseWindows.sort((a, b) => a.timeSeconds - b.timeSeconds);

  return { friendlyDispels, hostileDispels, missedCleanseWindows };
}

export function formatDispelContextForAI(summary: IDispelSummary): string[] {
  const lines: string[] = [];
  const { friendlyDispels, hostileDispels, missedCleanseWindows } = summary;

  lines.push('DISPEL ANALYSIS:');

  lines.push('  Your team dispels (cleanses off allies + purges off enemies):');
  if (friendlyDispels.length === 0) {
    lines.push('    None recorded');
  } else {
    for (const d of friendlyDispels) {
      lines.push(
        `    ${fmtTime(d.timeSeconds)} — [${d.sourceSpec}] removed ${d.removedSpellName} from ${d.targetSpec} [${d.priority}]`,
      );
    }
  }

  lines.push("  Enemy dispels (enemies purged your team's buffs):");
  if (hostileDispels.length === 0) {
    lines.push('    None recorded');
  } else {
    for (const d of hostileDispels) {
      lines.push(
        `    ${fmtTime(d.timeSeconds)} — [${d.sourceSpec}] stripped ${d.removedSpellName} from ${d.targetSpec} [${d.priority}]`,
      );
    }
  }

  const significantMissed = missedCleanseWindows.filter((w) => w.priority === 'Critical');
  lines.push('  Missed cleanse opportunities (Critical CC on ally lasting >3s without dispel):');
  if (significantMissed.length === 0) {
    lines.push('    None detected');
  } else {
    for (const w of significantMissed) {
      lines.push(
        `    ${fmtTime(w.timeSeconds)} — ${w.targetSpec} was in ${w.spellName} [${w.dispelType}] for ${Math.round(w.durationSeconds)}s uncleansed`,
      );
    }
  }

  return lines;
}
