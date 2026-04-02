import { AtomicArenaCombat, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { spellEffectData } from '../data/spellEffectData';
import spellsData from '../data/spells.json';
import { fmtTime, isHealerSpec, specToString } from './cooldowns';

type SpellEntry = { type: string };
const SPELLS = spellsData as Record<string, SpellEntry>;
import { computeDampening, dampeningDangerMultiplier, fmtDampening } from './dampening';
import { dangerLabel, isOffensiveSpell, SPELL_EFFECT_OVERRIDES, spellDangerWeight } from './spellDanger';

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
  dampeningPct: number; // 0–1
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

  // Max CD to consider a "real" cooldown (filters out 999.999s passive procs)
  const MAX_CD_SECONDS = 360;

  for (const enemy of enemies) {
    const offensiveCDs: IEnemyCDCast[] = [];

    for (const cast of enemy.spellCastEvents) {
      if (cast.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
      const { spellId } = cast;
      if (!isOffensiveSpell(spellId)) continue;
      const effectData = spellEffectData[spellId];
      if (!effectData) continue;
      const cooldownSeconds = effectData.cooldownSeconds ?? effectData.charges?.chargeCooldownSeconds ?? 0;
      if (cooldownSeconds < MIN_CD_SECONDS || cooldownSeconds > MAX_CD_SECONDS) continue;

      const castTimeSeconds = (cast.logLine.timestamp - matchStartMs) / 1000;
      offensiveCDs.push({
        spellId,
        spellName: effectData.name,
        castTimeSeconds,
        cooldownSeconds,
        availableAgainAtSeconds: castTimeSeconds + cooldownSeconds,
      });
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
  const totalFriendlyDamage = allFriendlyDamage.reduce((sum, e) => sum + Math.abs(e.effectiveAmount), 0);
  const avgWindowDamage =
    matchDurationSeconds > 0 ? totalFriendlyDamage / (matchDurationSeconds / BURST_CLUSTER_SECONDS) : 0;

  const alignedBurstWindows: IAlignedBurstWindow[] = [];
  let i = 0;
  while (i < allCasts.length) {
    const windowStart = allCasts[i].time;
    const inWindow = allCasts.filter((c) => c.time >= windowStart && c.time <= windowStart + BURST_CLUSTER_SECONDS);
    if (inWindow.length >= 2) {
      const windowEnd = inWindow[inWindow.length - 1].time;

      // Compute CD-based danger score
      const cdScore = inWindow.reduce((sum, c) => sum + spellDangerWeight(c.spellId, c.cooldownSeconds), 0);
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
      const bracket = combat.startInfo?.bracket ?? '3v3';
      const allPlayers = [...enemies, ...(friendlies ?? [])];
      const dampening = computeDampening(windowStart * 1000 + matchStartMs, bracket, allPlayers);
      const dampeningMult = dampeningDangerMultiplier(dampening);

      // Healer CC explicit check: find if the healer had an active CC aura during this window
      let healerCCed = false;
      const windowDuration = windowEnd - windowStart;
      if (owner && isHealerSpec(owner.spec)) {
        const windowStartMs = matchStartMs + windowStart * 1000;
        const windowEndMs = matchStartMs + windowEnd * 1000;

        // Track CC start time per spellId to handle multiple overlapping CC auras correctly
        const ccStartBySpell = new Map<string, number>();
        for (const a of owner.auraEvents) {
          if (!a.spellId) continue;
          const entry = SPELLS[a.spellId];
          if (entry?.type === 'cc') {
            if (a.logLine.event === LogEvent.SPELL_AURA_APPLIED || a.logLine.event === LogEvent.SPELL_AURA_REFRESH) {
              ccStartBySpell.set(a.spellId, a.logLine.timestamp);
            } else if (
              a.logLine.event === LogEvent.SPELL_AURA_REMOVED ||
              a.logLine.event === LogEvent.SPELL_AURA_BROKEN ||
              a.logLine.event === LogEvent.SPELL_AURA_BROKEN_SPELL
            ) {
              const ccStart = ccStartBySpell.get(a.spellId) ?? 0;
              const ccEnd = a.logLine.timestamp;
              // Check if CC overlaps with the burst window
              if (ccStart > 0 && ccStart < windowEndMs && ccEnd > windowStartMs) {
                healerCCed = true;
                break;
              }
              ccStartBySpell.delete(a.spellId);
            }
          }
        }

        // Fallback: if no explicit CC aura found but healer cast nothing in a long window,
        // treat as pseudo-CCed (school lockout, kiting, etc.)
        if (!healerCCed && windowDuration >= 5) {
          const ownerCastsInWindow = owner.spellCastEvents.filter((e) => {
            const t = (e.logLine.timestamp - matchStartMs) / 1000;
            return t >= windowStart && t <= windowEnd;
          });
          if (ownerCastsInWindow.length === 0) {
            healerCCed = true;
          }
        }
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
export function formatEnemyCDTimelineForContext(timeline: IEnemyCDTimeline, matchDurationSeconds: number): string[] {
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
      const effects = SPELL_EFFECT_OVERRIDES[cd.spellId];
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
        const weight = cdData ? spellDangerWeight(cd.spellId, cdData.cooldownSeconds).toFixed(2) : '?';
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
