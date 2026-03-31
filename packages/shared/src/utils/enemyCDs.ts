import { AtomicArenaCombat, classMetadata, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { spellEffectData } from '../data/spellEffectData';
import { fmtTime, specToString } from './cooldowns';

const MIN_CD_SECONDS = 30;
/** Two enemy offensive CD casts within this window are considered an aligned burst */
const BURST_CLUSTER_SECONDS = 10;

export interface IEnemyCDCast {
  spellId: string;
  spellName: string;
  castTimeSeconds: number;
  cooldownSeconds: number;
  /** When this CD will be available again (may exceed match duration) */
  availableAgainAtSeconds: number;
}

export interface IEnemyPlayerTimeline {
  playerName: string;
  specName: string;
  offensiveCDs: IEnemyCDCast[];
}

export interface IAlignedBurstWindow {
  fromSeconds: number;
  toSeconds: number;
  activeCDs: Array<{ playerName: string; spellName: string }>;
}

export interface IEnemyCDTimeline {
  players: IEnemyPlayerTimeline[];
  /** Windows where 2+ enemy offensive CDs were used within BURST_CLUSTER_SECONDS of each other */
  alignedBurstWindows: IAlignedBurstWindow[];
}

/**
 * For each enemy player, reconstruct when their offensive cooldowns (>= 30s) were cast
 * and when each CD will be available again. Also identifies aligned burst windows where
 * multiple enemies stacked offensive CDs together.
 */
export function reconstructEnemyCDTimeline(
  enemies: ICombatUnit[],
  combat: AtomicArenaCombat,
): IEnemyCDTimeline {
  const matchStartMs = combat.startTime;
  const matchDurationSeconds = (combat.endTime - matchStartMs) / 1000;

  const players: IEnemyPlayerTimeline[] = [];

  for (const enemy of enemies) {
    const classData = classMetadata.find((c) => c.unitClass === enemy.class);
    if (!classData) continue;

    const seen = new Set<string>();
    const offensiveSpells = classData.abilities.filter((spell) => {
      if (seen.has(spell.spellId)) return false;
      if (!spell.tags.some((t) => String(t) === 'Offensive')) return false;
      const effectData = spellEffectData[spell.spellId];
      if (!effectData) return false;
      const cd = effectData.cooldownSeconds ?? effectData.charges?.chargeCooldownSeconds ?? 0;
      if (cd < MIN_CD_SECONDS) return false;
      seen.add(spell.spellId);
      return true;
    });

    const offensiveCDs: IEnemyCDCast[] = [];

    for (const spell of offensiveSpells) {
      const effectData = spellEffectData[spell.spellId]!;
      const cooldownSeconds =
        effectData.cooldownSeconds ?? effectData.charges?.chargeCooldownSeconds ?? 0;

      const castEvents = enemy.spellCastEvents.filter(
        (e) => e.spellId === spell.spellId && e.logLine.event === LogEvent.SPELL_CAST_SUCCESS,
      );

      for (const cast of castEvents) {
        const castTimeSeconds = (cast.logLine.timestamp - matchStartMs) / 1000;
        offensiveCDs.push({
          spellId: spell.spellId,
          spellName: spell.name,
          castTimeSeconds,
          cooldownSeconds,
          availableAgainAtSeconds: castTimeSeconds + cooldownSeconds,
        });
      }
    }

    offensiveCDs.sort((a, b) => a.castTimeSeconds - b.castTimeSeconds);

    if (offensiveCDs.length > 0) {
      players.push({
        playerName: enemy.name,
        specName: specToString(enemy.spec),
        offensiveCDs,
      });
    }
  }

  // Find aligned burst windows: clusters of 2+ casts within BURST_CLUSTER_SECONDS
  const allCasts = players
    .flatMap((p) =>
      p.offensiveCDs.map((cd) => ({
        time: cd.castTimeSeconds,
        playerName: p.playerName,
        spellName: cd.spellName,
      })),
    )
    .sort((a, b) => a.time - b.time);

  const alignedBurstWindows: IAlignedBurstWindow[] = [];
  let i = 0;
  while (i < allCasts.length) {
    const windowStart = allCasts[i].time;
    const inWindow = allCasts.filter(
      (c) => c.time >= windowStart && c.time <= windowStart + BURST_CLUSTER_SECONDS,
    );
    if (inWindow.length >= 2) {
      alignedBurstWindows.push({
        fromSeconds: windowStart,
        toSeconds: inWindow[inWindow.length - 1].time,
        activeCDs: inWindow.map((c) => ({ playerName: c.playerName, spellName: c.spellName })),
      });
      i += inWindow.length;
    } else {
      i++;
    }
  }

  return { players, alignedBurstWindows };
}

/**
 * Renders the enemy CD timeline as plain text lines for inclusion in the AI context prompt.
 */
export function formatEnemyCDTimelineForContext(
  timeline: IEnemyCDTimeline,
  matchDurationSeconds: number,
): string[] {
  const lines: string[] = [];

  lines.push('ENEMY OFFENSIVE COOLDOWN TIMELINE:');

  if (timeline.players.length === 0) {
    lines.push('  No enemy offensive cooldown data found.');
    return lines;
  }

  for (const player of timeline.players) {
    lines.push('');
    lines.push(`  ${player.specName} (${player.playerName}):`);
    for (const cd of player.offensiveCDs) {
      const backStr =
        cd.availableAgainAtSeconds <= matchDurationSeconds
          ? ` → back at ${fmtTime(cd.availableAgainAtSeconds)}`
          : ' → not available again before match ended';
      lines.push(
        `    ${cd.spellName} [${cd.cooldownSeconds}s CD]: cast at ${fmtTime(cd.castTimeSeconds)}${backStr}`,
      );
    }
  }

  if (timeline.alignedBurstWindows.length > 0) {
    lines.push('');
    lines.push('ENEMY ALIGNED BURST WINDOWS (2+ offensive CDs within 10s of each other):');
    timeline.alignedBurstWindows.forEach((w, idx) => {
      const cdList = w.activeCDs.map((c) => `${c.spellName} (${c.playerName})`).join(' + ');
      lines.push(`  ${idx + 1}. ${fmtTime(w.fromSeconds)}: ${cdList}`);
    });
  }

  return lines;
}
