import { CombatExtraSpellAction, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import dispelPriorityData from '../data/dispelPriority.json';
import { fmtTime, specToString } from './cooldowns';

export type DispelPriority = 'Critical' | 'High' | 'Medium' | 'Low';

const DISPEL_PRIORITY = dispelPriorityData as Record<string, DispelPriority>;

const MISSED_CLEANSE_THRESHOLD_S = 3;

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
}

export interface IDispelSummary {
  friendlyDispels: IDispelEvent[];
  hostileDispels: IDispelEvent[];
  missedCleanseWindows: IMissedCleanseWindow[];
}

function getPriority(spellId: string): DispelPriority {
  return DISPEL_PRIORITY[spellId] ?? 'Low';
}

export function reconstructDispelSummary(
  friends: ICombatUnit[],
  enemies: ICombatUnit[],
  combat: { startTime: number },
): IDispelSummary {
  const friendlyIds = new Set(friends.map((u) => u.id));
  const enemyIds = new Set(enemies.map((u) => u.id));
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
        `    ${fmtTime(w.timeSeconds)} — ${w.targetSpec} was in ${w.spellName} for ${Math.round(w.durationSeconds)}s uncleansed`,
      );
    }
  }

  return lines;
}
