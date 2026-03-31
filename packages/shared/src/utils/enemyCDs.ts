import { AtomicArenaCombat, classMetadata, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { spellEffectData } from '../data/spellEffectData';
import { computeDampening, dampeningDangerMultiplier, fmtDampening } from './dampening';
import { fmtTime, specToString } from './cooldowns';
import { dangerLabel, SPELL_DANGER_DATA, spellDangerWeight } from './spellDanger';

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
  activeCDs: Array<{ playerName: string; spellName: string; spellId: string }>;
  dangerScore: number;
  dangerLabel: 'Low' | 'Moderate' | 'High' | 'Critical';
  dampeningPct: number;   // 0–1
  damageInWindow: number;
  damageRatio: number;
  healerCCed: boolean;
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
  owner?: ICombatUnit,
  friendlies?: ICombatUnit[],
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
        spellId: cd.spellId,
        cooldownSeconds: cd.cooldownSeconds,
      })),
    )
    .sort((a, b) => a.time - b.time);

  // Compute total friendly damage for ratio calculation
  const allFriendlyDamage = (friendlies ?? []).flatMap((u) => u.damageIn);
  const totalFriendlyDamage = allFriendlyDamage.reduce(
    (sum, e) => sum + Math.abs(e.effectiveAmount),
    0,
  );
  const avgWindowDamage =
    matchDurationSeconds > 0
      ? totalFriendlyDamage / (matchDurationSeconds / BURST_CLUSTER_SECONDS)
      : 0;

  const alignedBurstWindows: IAlignedBurstWindow[] = [];
  let i = 0;
  while (i < allCasts.length) {
    const windowStart = allCasts[i].time;
    const inWindow = allCasts.filter(
      (c) => c.time >= windowStart && c.time <= windowStart + BURST_CLUSTER_SECONDS,
    );
    if (inWindow.length >= 2) {
      const windowEnd = inWindow[inWindow.length - 1].time;

      // Compute CD-based danger score
      const cdScore = inWindow.reduce(
        (sum, c) => sum + spellDangerWeight(c.spellId, c.cooldownSeconds),
        0,
      );
      const alignmentMultiplier = inWindow.length >= 3 ? 1.5 : 1.0;

      // Compute damage in window (±BURST_CLUSTER_SECONDS around burst start)
      const windowDamage = allFriendlyDamage
        .filter((e) => {
          const t = (e.logLine.timestamp - matchStartMs) / 1000;
          return t >= windowStart - BURST_CLUSTER_SECONDS && t <= windowStart + BURST_CLUSTER_SECONDS;
        })
        .reduce((sum, e) => sum + Math.abs(e.effectiveAmount), 0);

      const damageRatio = avgWindowDamage > 0 ? Math.max(windowDamage / avgWindowDamage, 0.5) : 0.5;

      // Dampening at window start
      const dampening = computeDampening(windowStart);
      const dampeningMult = dampeningDangerMultiplier(dampening);

      // Healer CC proxy: owner made 0 casts in the window (only for windows >= 5s)
      const windowDuration = windowEnd - windowStart;
      let healerCCed = false;
      if (owner && windowDuration >= 5) {
        const ownerCastsInWindow = owner.spellCastEvents.filter((e) => {
          const t = (e.logLine.timestamp - matchStartMs) / 1000;
          return t >= windowStart && t <= windowEnd;
        });
        healerCCed = ownerCastsInWindow.length === 0;
      }
      const healerMult = 1.0 + (healerCCed ? 0.8 : 0.0);

      const score = cdScore * alignmentMultiplier * damageRatio * dampeningMult * healerMult;

      alignedBurstWindows.push({
        fromSeconds: windowStart,
        toSeconds: windowEnd,
        activeCDs: inWindow.map((c) => ({
          playerName: c.playerName,
          spellName: c.spellName,
          spellId: c.spellId,
        })),
        dangerScore: score,
        dangerLabel: dangerLabel(score),
        dampeningPct: dampening,
        damageInWindow: windowDamage,
        damageRatio,
        healerCCed,
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
      const effects = SPELL_DANGER_DATA[cd.spellId];
      const effectStr = effects ? effects.join(', ') : 'DamageAmp';
      const backStr =
        cd.availableAgainAtSeconds <= matchDurationSeconds
          ? ` → back at ${fmtTime(cd.availableAgainAtSeconds)}`
          : ' → not available again before match ended';
      lines.push(
        `    ${cd.spellName} [${cd.cooldownSeconds}s CD, ${effectStr}]: cast at ${fmtTime(cd.castTimeSeconds)}${backStr}`,
      );
    }
  }

  if (timeline.alignedBurstWindows.length > 0) {
    lines.push('');
    lines.push('ENEMY ALIGNED BURST WINDOWS:');
    timeline.alignedBurstWindows.forEach((w, idx) => {
      const scoreStr = w.dangerScore.toFixed(1);
      const labelStr = w.dangerLabel.toUpperCase();
      const dampStr = fmtDampening(w.dampeningPct);
      lines.push(
        `  #${idx + 1} — ${fmtTime(w.fromSeconds)} | Score: ${scoreStr} [${labelStr}] | Dampening: ${dampStr}`,
      );

      for (const cd of w.activeCDs) {
        const cdData = timeline.players
          .flatMap((p) => p.offensiveCDs)
          .find((c) => c.spellId === cd.spellId && c.playerName === cd.playerName);
        const weight = cdData
          ? spellDangerWeight(cd.spellId, cdData.cooldownSeconds).toFixed(2)
          : '?';
        lines.push(`    ${cd.spellName} (${cd.playerName}, weight ${weight})`);
      }

      const dmgM = (w.damageInWindow / 1_000_000).toFixed(2);
      const ratioStr = `${w.damageRatio.toFixed(1)}× match avg`;
      const healerStr = w.healerCCed ? 'Healer CCed: YES' : 'Healer: free to cast';
      lines.push(`    Damage: ${dmgM}M (${ratioStr}) | ${healerStr}`);
    });
  }

  return lines;
}
