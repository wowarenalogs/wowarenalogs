import { ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { IPlayerCCTrinketSummary } from '../../../utils/ccTrinketAnalysis';
import {
  fmtTime,
  getUnitHpAtTimestamp,
  IDamageBucket,
  IMajorCooldownInfo,
  IOverlappedDefensive,
  IPanicDefensive,
  specToString,
} from '../../../utils/cooldowns';
import { IDispelSummary } from '../../../utils/dispelAnalysis';
import { extractAoeCCEvents, IOutgoingCCChain } from '../../../utils/drAnalysis';
import { IEnemyCDTimeline } from '../../../utils/enemyCDs';
import { IHealingGap } from '../../../utils/healingGaps';
import { getHpPercentAtTime, getLowestHpPercentInWindow } from '../../../utils/killWindowTargetSelection';

// ── Shared helpers ─────────────────────────────────────────────────────────

/** Returns the last cast at or before `timeSeconds`, or undefined if none. */
function lastCastBefore(cd: IMajorCooldownInfo, timeSeconds: number) {
  return cd.casts.filter((c) => c.timeSeconds <= timeSeconds).slice(-1)[0];
}

// ── Critical moment identification helpers ─────────────────────────────────

/**
 * Healer spell IDs that should appear as [OWNER CAST] gap-fillers when they are NOT
 * already tracked by ownerCDs (to avoid double-counting).  Keep in sync with
 * classMetadata.ts as new specs / abilities ship.
 *
 * Sources: Wowhead / WoW API — verified against Patch 11.x spell IDs.
 */
const HEALER_CAST_SPELL_ID_TO_NAME: Record<string, string> = {
  // ── Priest ─────────────────────────────────────────────────────────────────
  '10060': 'Power Infusion', // Holy/Disc — external DPS CD
  '33206': 'Pain Suppression', // Disc — defensive external
  '265202': 'Holy Word: Salvation', // Holy — raid/party heal CD
  '200183': 'Apotheosis', // Holy — healing amplifier
  '47788': 'Guardian Spirit', // Holy — prevent-death external
  // ── Shaman ─────────────────────────────────────────────────────────────────
  '108280': 'Healing Tide Totem', // Resto — party heal CD
  '98008': 'Spirit Link Totem', // Resto — damage redistribution
  '114052': 'Ascendance', // Resto — healing burst CD
  // ── Druid ──────────────────────────────────────────────────────────────────
  '29166': 'Innervate', // Resto — mana external / self
  '740': 'Tranquility', // Resto — AoE heal channel
  // ── Monk ───────────────────────────────────────────────────────────────────
  '116849': 'Life Cocoon', // Mistweaver — absorb external
  '115310': 'Revival', // Mistweaver — group dispel + heal
  // ── Paladin ────────────────────────────────────────────────────────────────
  '31884': 'Avenging Wrath', // Holy — healing/damage amp
  '216331': 'Avenging Crusader', // Holy alt-talent
  '114165': 'Holy Prism', // not a CD but a high-value cast tracked in some builds
  '6940': 'Blessing of Sacrifice', // Holy — damage redirect external
  '316011': 'Symbol of Hope', // Holy — mana restoration for team
  // ── Evoker ─────────────────────────────────────────────────────────────────
  '363534': 'Rewind', // Preservation — rewind time
  '370537': 'Stasis', // Preservation — store heals
};

// ── Enemy major buff tracking (F67) ──────────────────────────────────────────

// Only spells that generate SPELL_AURA_APPLIED events on enemy players in WoW combat logs.
// Mass-buff effects (Bloodlust, Heroism, Time Warp) do NOT generate individual aura events for
// enemy team members — they are already visible via [ENEMY CD] / Enemy active in the prompt.
const ENEMY_MAJOR_BUFF_SPELL_IDS: Record<string, { name: string; purgeable: boolean }> = {
  '10060': { name: 'Power Infusion', purgeable: true },
};

export interface IEnemyBuffInterval {
  spellId: string;
  spellName: string;
  startSeconds: number;
  endSeconds: number;
  purgeable: boolean;
}

/**
 * Scans each enemy unit's auraEvents and returns intervals during which a major
 * tracked buff (PI, Bloodlust, etc.) was active.  Unclosed buffs at match end are
 * clamped to matchEndMs so a buff active at the final snapshot is still visible.
 */
export function extractEnemyMajorBuffIntervals(
  enemies: ICombatUnit[],
  matchStartMs: number,
  matchEndMs: number,
): Map<string, IEnemyBuffInterval[]> {
  const result = new Map<string, IEnemyBuffInterval[]>();

  for (const enemy of enemies) {
    const intervals: IEnemyBuffInterval[] = [];
    // key: "${spellId}:${srcUnitId}" → startMs
    const openBuffs = new Map<string, number>();

    for (const event of enemy.auraEvents) {
      const spellId = event.spellId ?? '';
      const buffDef = ENEMY_MAJOR_BUFF_SPELL_IDS[spellId];
      if (!buffDef) continue;

      const stateKey = `${spellId}:${event.srcUnitId}`;
      const ts: number = event.logLine.timestamp;

      if (event.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
        if (!openBuffs.has(stateKey)) {
          openBuffs.set(stateKey, ts);
        }
      } else if (event.logLine.event === LogEvent.SPELL_AURA_REMOVED) {
        const startMs = openBuffs.get(stateKey);
        if (startMs !== undefined) {
          intervals.push({
            spellId,
            spellName: buffDef.name,
            startSeconds: (startMs - matchStartMs) / 1000,
            endSeconds: (ts - matchStartMs) / 1000,
            purgeable: buffDef.purgeable,
          });
          openBuffs.delete(stateKey);
        }
      }
    }

    // Clamp any unclosed buffs to match end
    for (const [stateKey, startMs] of openBuffs) {
      const spellId = stateKey.split(':')[0];
      const buffDef = ENEMY_MAJOR_BUFF_SPELL_IDS[spellId];
      if (buffDef) {
        intervals.push({
          spellId,
          spellName: buffDef.name,
          startSeconds: (startMs - matchStartMs) / 1000,
          endSeconds: (matchEndMs - matchStartMs) / 1000,
          purgeable: buffDef.purgeable,
        });
      }
    }

    if (intervals.length > 0) {
      result.set(enemy.name, intervals);
    }
  }

  return result;
}

// ── Module-level constants shared across builders ──────────────────────────

/** Minimum total damage for a pressure window to be treated as a [DMG SPIKE] event. */
export const DMG_SPIKE_THRESHOLD = 300_000;

/**
 * Extracts the top-N damage sources that hit `unit` within the `windowMs` window
 * ending at `deathMs`. Returns an array of formatted "source — spell (Xk)" strings.
 */
export function getTopDamageSourcesInWindow(unit: ICombatUnit, endMs: number, windowMs: number, topN = 3): string[] {
  const startMs = endMs - windowMs;
  const buckets = new Map<string, number>();
  for (const d of unit.damageIn) {
    if (d.logLine.timestamp < startMs || d.logLine.timestamp > endMs) continue;
    const dmg = Math.abs(d.effectiveAmount);
    if (dmg <= 0) continue;
    const key = `${d.srcUnitName || 'Unknown'} — ${d.spellName ?? 'melee'}`;
    buckets.set(key, (buckets.get(key) ?? 0) + dmg);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([k, v]) => `${k} (${Math.round(v / 1000)}k)`);
}

export type MomentRole = 'Constraint' | 'Kill' | 'Trade' | 'Setup' | 'Consequence' | 'Standalone';

export interface CriticalMoment {
  timeSeconds: number;
  impactScore: number;
  impactLabel: 'Critical' | 'High' | 'Moderate';
  roleLabel: MomentRole;
  title: string;
  enemyState: string;
  friendlyState: string;
  whatHappened: string;
  /** For Constraint moments: what the trade locked out going forward */
  implication?: string[];
  /** Mechanical CD/trinket availability at this moment — anti-hallucination guard */
  mechanicalAvailability: string[];
  /** Interpretive decision space — actual alternatives that existed */
  interpretation: string[];
  /** Only on Kill moments: three-tier option availability */
  tieredOptions?: { realistic: string[]; limited: string[]; unavailable: string[] };
  /** Only on Kill moments: structural context and micro-level mistakes (facts only — no verdict) */
  finalAssessment?: { macroOutcome: string; microMistakes: string[] };
  /** Legacy field — used for Trade/Setup/Pressure moments */
  availableOptions: string;
  uncertainty: string;
  isDeath?: boolean;
  contributingDeathSpec?: string;
  contributingDeathAtSeconds?: number;
  /** Backward causal trace from death: what CDs were unavailable and why, plus CC context */
  rootCauseTrace?: string[];
}

export function getEnemyStateAtTime(
  timeSeconds: number,
  enemyCDTimeline: IEnemyCDTimeline,
  peakDamagePressure5s?: number,
): string {
  // Prefer aligned burst windows: look for a burst that started within 15s before or 5s after the moment
  const relevant = enemyCDTimeline.alignedBurstWindows.filter(
    (w) => w.fromSeconds <= timeSeconds + 5 && w.toSeconds >= timeSeconds - 15,
  );
  if (relevant.length > 0) {
    const best = [...relevant].sort((a, b) => b.dangerScore - a.dangerScore)[0];
    const cdNames = best.activeCDs.map((c) => `${c.playerName}: ${c.spellName}`).join(', ');
    return `Aligned burst (${best.dangerLabel} threat) — ${cdNames}`;
  }
  // Fall back to individual offensive CDs cast near this time (≥90s cooldown only)
  const nearCDs: string[] = [];
  for (const player of enemyCDTimeline.players) {
    for (const cd of player.offensiveCDs) {
      if (cd.castTimeSeconds >= timeSeconds - 15 && cd.castTimeSeconds <= timeSeconds + 5 && cd.cooldownSeconds >= 90) {
        nearCDs.push(`${player.playerName}: ${cd.spellName} at ${fmtTime(cd.castTimeSeconds)}`);
      }
    }
  }
  if (nearCDs.length > 0) return `Individual offensive CDs near this window: ${nearCDs.join(', ')}`;
  if (peakDamagePressure5s !== undefined) {
    const peakK = Math.round(peakDamagePressure5s / 1000);
    return `No coordinated burst detected — sustained/DoT or single-target pressure (peak: ${peakK}k in 5s)`;
  }
  return 'No coordinated burst detected in this window';
}

export function getOwnerCDsAvailable(timeSeconds: number, cooldowns: IMajorCooldownInfo[]): string {
  const available: string[] = [];
  const onCD: string[] = [];
  for (const cd of cooldowns) {
    if (cd.neverUsed) {
      available.push(`${cd.spellName} (never used — available since match start)`);
      continue;
    }
    const castsBeforeNow = cd.casts.filter((c) => c.timeSeconds <= timeSeconds);
    if (castsBeforeNow.length === 0) {
      available.push(`${cd.spellName} (not yet used)`);
    } else {
      const lastCast = castsBeforeNow[castsBeforeNow.length - 1];
      const readyAt = lastCast.timeSeconds + cd.cooldownSeconds;
      if (readyAt <= timeSeconds) {
        available.push(`${cd.spellName} (ready since ${fmtTime(readyAt)})`);
      } else {
        onCD.push(`${cd.spellName} (on CD until ~${fmtTime(readyAt)})`);
      }
    }
  }
  const parts: string[] = [];
  if (available.length > 0) parts.push(`Available: ${available.join(', ')}`);
  if (onCD.length > 0) parts.push(`On cooldown: ${onCD.join(', ')}`);
  return parts.join(' | ') || 'No major CD data for log owner';
}

/**
 * Traces backward from a death to identify root causes:
 * - Which owner CDs were on cooldown at death time, and whether the last use was panic/suboptimal
 * - Which owner CDs were available but never pressed
 * - Whether the dying player was CC'd in the window before death, and if it was avoidable
 */
export function buildDeathRootCauseTrace(
  deathTimeSeconds: number,
  ownerCooldowns: IMajorCooldownInfo[],
  dyingPlayerCC: IPlayerCCTrinketSummary | undefined,
  dyingUnit: ICombatUnit | undefined,
  matchStartMs: number,
): string[] {
  const traces: string[] = [];

  // 0a. HP trajectory leading to death
  if (dyingUnit) {
    const checkpoints = [15, 10, 5, 3];
    const trajectory: string[] = [];
    for (const secondsBefore of checkpoints) {
      const pct = getHpPercentAtTime(dyingUnit, deathTimeSeconds - secondsBefore, matchStartMs);
      if (pct !== null) {
        trajectory.push(`${Math.round(pct)}% at T-${secondsBefore}s`);
      }
    }
    if (trajectory.length > 0) {
      traces.push(
        `HP trajectory before death: ${trajectory.join(' → ')} → dead (sampled from last action as source — readings may lag by a few seconds if player was CCed or not casting)`,
      );
    }
  }

  // 0b. Top damage contributors in the 10s kill window
  if (dyingUnit) {
    const deathMs = matchStartMs + deathTimeSeconds * 1000;
    const topSources = getTopDamageSourcesInWindow(dyingUnit, deathMs, 10_000);
    if (topSources.length > 0) {
      traces.push(`Top damage sources in final 10s: ${topSources.join(', ')}`);
    }
  }

  // 1. Check each owner major CD: on CD (and why) vs available-but-not-pressed
  for (const cd of ownerCooldowns) {
    if (cd.neverUsed) {
      traces.push(`${cd.spellName} [${cd.tag}]: NEVER USED — was available throughout the match`);
      continue;
    }
    const castsBeforeDeath = cd.casts.filter((c) => c.timeSeconds <= deathTimeSeconds);
    if (castsBeforeDeath.length === 0) {
      // Never used before this death — was available
      traces.push(`${cd.spellName} [${cd.tag}]: not yet used — was available at death time`);
      continue;
    }
    const lastCast = castsBeforeDeath[castsBeforeDeath.length - 1];
    const readyAt = lastCast.timeSeconds + cd.cooldownSeconds;
    if (readyAt > deathTimeSeconds) {
      // On cooldown at death — trace why
      const timeAgo = Math.round(deathTimeSeconds - lastCast.timeSeconds);
      const timing =
        lastCast.timingLabel && lastCast.timingLabel !== 'Unknown'
          ? ` [last use: ${lastCast.timingLabel.toUpperCase()}${lastCast.timingContext ? ` — ${lastCast.timingContext}` : ''}]`
          : '';
      traces.push(
        `${cd.spellName} [${cd.tag}]: ON COOLDOWN at death — last used ${fmtTime(lastCast.timeSeconds)} (${timeAgo}s before death)${timing}`,
      );
    } else {
      // Ready at death but not pressed
      traces.push(`${cd.spellName} [${cd.tag}]: available at death time — not pressed`);
    }
  }

  // 2. CC active on the dying player in the 12s window before/at death
  if (dyingPlayerCC) {
    const CC_LOOKBACK = 12;
    const relevantCC = dyingPlayerCC.ccInstances.filter(
      (cc) => cc.atSeconds <= deathTimeSeconds && cc.atSeconds + cc.durationSeconds >= deathTimeSeconds - CC_LOOKBACK,
    );
    for (const cc of relevantCC) {
      const endAt = cc.atSeconds + cc.durationSeconds;
      const avoidNote =
        cc.losBlocked === true
          ? ' — LoS was available (avoidable)'
          : cc.distanceYards !== null && cc.distanceYards <= 8
            ? ` — applied at ${cc.distanceYards.toFixed(0)}yd (melee range, possible positioning mistake)`
            : '';
      traces.push(
        `CC on dying player: ${cc.spellName} by ${cc.sourceSpec} (${cc.sourceName}) at ${fmtTime(cc.atSeconds)}–${fmtTime(endAt)} — trinket: ${cc.trinketState}${avoidNote}`,
      );
    }
  }

  return traces;
}

const DEATH_LOOKFORWARD_SECONDS = 45;

export function findContributingDeath(
  momentTimeSeconds: number,
  friendlyDeaths: Array<{ spec: string; name: string; atSeconds: number }>,
): { spec: string; atSeconds: number } | undefined {
  return friendlyDeaths.find(
    (d) => d.atSeconds > momentTimeSeconds && d.atSeconds <= momentTimeSeconds + DEATH_LOOKFORWARD_SECONDS,
  );
}

export function buildKillMomentFields(
  deathTimeSeconds: number,
  cooldowns: IMajorCooldownInfo[],
  dyingPlayerCC: IPlayerCCTrinketSummary | undefined,
  constrainedTradePreceded: boolean,
  dyingHpPct: number | null,
): {
  mechanicalAvailability: string[];
  interpretation: string[];
  tieredOptions: { realistic: string[]; limited: string[]; unavailable: string[] };
  finalAssessment: { macroOutcome: string; microMistakes: string[] } | undefined;
} {
  const mechAvail: string[] = [];
  const interp: string[] = [];

  // Mechanical: list all defensive CDs and their state at death
  for (const cd of cooldowns) {
    if (cd.tag !== 'Defensive') continue;
    const lastCast = lastCastBefore(cd, deathTimeSeconds);
    if (!lastCast) {
      mechAvail.push(
        cd.neverUsed ? `${cd.spellName}: never used — available` : `${cd.spellName}: not yet used — available`,
      );
    } else {
      const readyAt = lastCast.timeSeconds + cd.cooldownSeconds;
      if (readyAt > deathTimeSeconds) {
        mechAvail.push(`${cd.spellName}: on CD (last used ${fmtTime(lastCast.timeSeconds)})`);
      } else {
        mechAvail.push(`${cd.spellName}: available since ${fmtTime(readyAt)}`);
      }
    }
  }

  // Mechanical: trinket near death
  const CC_LOOKBACK = 15;
  const nearDeathTrinketAvailable = dyingPlayerCC?.ccInstances.find(
    (cc) =>
      cc.atSeconds <= deathTimeSeconds &&
      cc.atSeconds >= deathTimeSeconds - CC_LOOKBACK &&
      cc.trinketState === 'available_unused',
  );
  if (nearDeathTrinketAvailable) {
    mechAvail.push(
      `Trinket available at ${fmtTime(nearDeathTrinketAvailable.atSeconds)} during ${nearDeathTrinketAvailable.spellName} — not used`,
    );
  } else {
    mechAvail.push('Trinket: on cooldown or already spent');
  }

  // Interpretation
  if (constrainedTradePreceded) {
    interp.push('No direct defensive response possible at death — resource exhausted by opening burst trade');
  } else {
    const spentCDs = cooldowns.filter((cd) => {
      if (cd.tag !== 'Defensive') return false;
      const lastCast = lastCastBefore(cd, deathTimeSeconds);
      if (!lastCast) return false;
      return lastCast.timeSeconds + cd.cooldownSeconds > deathTimeSeconds;
    });
    if (spentCDs.length > 0) {
      interp.push(`Major defensives spent: ${spentCDs.map((cd) => cd.spellName).join(', ')}`);
    }
  }
  if (nearDeathTrinketAvailable) {
    interp.push(
      `Trinket during ${nearDeathTrinketAvailable.spellName} at ${fmtTime(nearDeathTrinketAvailable.atSeconds)} could have created a short survival window`,
    );
  }
  const nearDeathMeleeCC = dyingPlayerCC?.ccInstances.find(
    (cc) =>
      cc.atSeconds <= deathTimeSeconds &&
      cc.atSeconds >= deathTimeSeconds - CC_LOOKBACK &&
      cc.distanceYards !== null &&
      cc.distanceYards <= 8,
  );
  if (nearDeathMeleeCC) {
    interp.push(
      `Melee-range CC (${nearDeathMeleeCC.spellName} at ${nearDeathMeleeCC.distanceYards?.toFixed(0)}yd) may indicate positioning contributed to exposure (uncertain)`,
    );
  }

  // Three-tier option breakdown
  const tieredOptions = {
    realistic: [] as string[],
    limited: [] as string[],
    unavailable: [] as string[],
  };
  if (nearDeathTrinketAvailable) {
    tieredOptions.realistic.push(
      `Trinket during ${nearDeathTrinketAvailable.spellName} at ${fmtTime(nearDeathTrinketAvailable.atSeconds)} — only immediate actionable response`,
    );
  }
  if (nearDeathMeleeCC) {
    tieredOptions.limited.push(`Minor positioning adjustments to avoid melee-range CC (uncertain feasibility)`);
  }
  const defensiveCDs = cooldowns.filter((cd) => cd.tag === 'Defensive');
  const allDefensivesSpent =
    defensiveCDs.length > 0 &&
    defensiveCDs.every((cd) => {
      const lastCast = lastCastBefore(cd, deathTimeSeconds);
      if (!lastCast) return false; // never-used = available, not spent
      return lastCast.timeSeconds + cd.cooldownSeconds > deathTimeSeconds;
    });
  if (constrainedTradePreceded || allDefensivesSpent) {
    tieredOptions.unavailable.push(`No major defensive CDs available (all committed earlier in the match)`);
  }

  // Final assessment: structural context + micro-level facts (no pre-drawn verdict)
  let finalAssessment: { macroOutcome: string; microMistakes: string[] } | undefined;
  if (constrainedTradePreceded) {
    const microMistakes: string[] = [];
    if (nearDeathTrinketAvailable) {
      microMistakes.push(
        `Trinket not used at ${fmtTime(nearDeathTrinketAvailable.atSeconds)} (minor survival extension possible)`,
      );
    }
    if (nearDeathMeleeCC) {
      microMistakes.push(`Positioning allowed melee-range ${nearDeathMeleeCC.spellName} (uncertain impact)`);
    }
    const hpNote = dyingHpPct !== null ? ` (player was at ${Math.round(dyingHpPct)}% HP 5s before death)` : '';
    finalAssessment = {
      macroOutcome: `All major defensive CDs committed in opening trade with no recovery window before this death${hpNote}`,
      microMistakes,
    };
  }

  return {
    mechanicalAvailability: mechAvail,
    interpretation: interp,
    tieredOptions,
    finalAssessment,
  };
}

export function identifyCriticalMoments(
  isHealer: boolean,
  cooldowns: IMajorCooldownInfo[],
  enemyCDTimeline: IEnemyCDTimeline,
  friendlyDeaths: Array<{ spec: string; name: string; atSeconds: number }>,
  healingGaps: IHealingGap[],
  panicDefensives: IPanicDefensive[],
  overlappedDefensives: IOverlappedDefensive[],
  ccTrinketSummaries: IPlayerCCTrinketSummary[],
  peakDamagePressure5s: number,
  durationSeconds: number,
  friends: ICombatUnit[],
  matchStartMs: number,
): { moments: CriticalMoment[]; constrainedTrade: boolean } {
  const moments: CriticalMoment[] = [];
  const unitsByName = new Map(friends.map((u) => [u.name, u]));
  const unitsById = new Map(friends.map((u) => [u.id, u]));
  function hpPctNote(unit: ICombatUnit | undefined, atSeconds: number): string {
    if (!unit) return '';
    const pct = getHpPercentAtTime(unit, atSeconds, matchStartMs);
    return pct !== null ? ` (${Math.round(pct)}% HP)` : '';
  }

  // 0. ConstrainedTrade — opening burst correctly traded but match too short for CD recovery
  // Gate: burst score ≥ 5.0 AND owner defensive CD traded into it AND match duration < that CD's
  //       cooldown (no recovery window) AND a friendly death follows
  const burstsSorted = [...enemyCDTimeline.alignedBurstWindows].sort((a, b) => a.fromSeconds - b.fromSeconds);
  const firstBurst = burstsSorted[0];
  let constrainedTradePreceded = false;

  if (firstBurst && firstBurst.dangerScore >= 5.0 && friendlyDeaths.length > 0) {
    const tradedDefCDs = cooldowns.filter((cd) => {
      if (cd.tag !== 'Defensive') return false;
      return cd.casts.some(
        (c) => c.timeSeconds >= firstBurst.fromSeconds - 5 && c.timeSeconds <= firstBurst.toSeconds + 5,
      );
    });
    if (tradedDefCDs.length > 0) {
      const minCooldown = Math.min(...tradedDefCDs.map((cd) => cd.cooldownSeconds));
      if (durationSeconds < minCooldown) {
        constrainedTradePreceded = true;
        const cdNames = tradedDefCDs.map((cd) => cd.spellName).join(' + ');
        const enemyState = getEnemyStateAtTime(firstBurst.fromSeconds, enemyCDTimeline, peakDamagePressure5s);

        // Find the lowest HP friendly unit during the burst window to quantify pressure.
        // Scan the full window (not midpoint) so we capture the actual trough even if the
        // player is CC'd and not casting during the first half of the burst.
        let burstTargetHpNote = '';
        let lowestHpPct: number | null = null;
        let lowestHpName = '';
        for (const friend of friends) {
          const pct = getLowestHpPercentInWindow(friend, firstBurst.fromSeconds, firstBurst.toSeconds, matchStartMs);
          if (pct !== null && (lowestHpPct === null || pct < lowestHpPct)) {
            lowestHpPct = pct;
            lowestHpName = friend.name;
          }
        }
        if (lowestHpPct !== null) {
          burstTargetHpNote = ` Most pressured player (${lowestHpName}) reached ${Math.round(lowestHpPct)}% HP during burst window.`;
        }

        moments.push({
          timeSeconds: firstBurst.fromSeconds,
          impactScore: 90,
          impactLabel: 'Critical',
          roleLabel: 'Constraint',
          title: 'Opening burst forced full defensive trade',
          enemyState,
          friendlyState: `${cdNames} committed to survive the burst`,
          whatHappened: `${cdNames} committed at ~${fmtTime(firstBurst.fromSeconds + 2)} to survive burst (${Math.round(peakDamagePressure5s / 1000)}k peak).${burstTargetHpNote} Trade was likely correct given burst strength.`,
          implication: [
            `All major defensive CDs committed with no recovery window in a ${fmtTime(durationSeconds)} match`,
            'Any subsequent burst window would have no defensive answer available',
          ],
          mechanicalAvailability: tradedDefCDs.map(
            (cd) => `${cd.spellName}: committed — on CD until ~${fmtTime(firstBurst.fromSeconds + cd.cooldownSeconds)}`,
          ),
          interpretation: [
            `Trade was likely correct — burst score ${firstBurst.dangerScore.toFixed(1)}, peak ${Math.round(peakDamagePressure5s / 1000)}k`,
            'Holding any single CD risked death; the constraint is the match duration, not the decision',
          ],
          availableOptions: '',
          uncertainty:
            lowestHpPct !== null
              ? 'Log confirms HP% at burst midpoint. Whether a partial CD hold was viable depends on HP trajectory, which is directional only (HP sampled from caster advanced data, not per-hit).'
              : 'Cannot confirm HP% during burst or whether a partial CD hold was viable.',
        });
      }
    }
  }

  // 1. Friendly deaths — highest impact
  for (const death of friendlyDeaths) {
    const enemyState = getEnemyStateAtTime(death.atSeconds, enemyCDTimeline, peakDamagePressure5s);
    const cdState = getOwnerCDsAvailable(death.atSeconds, cooldowns);
    const nearbyGap = healingGaps.find((g) => g.fromSeconds <= death.atSeconds && g.toSeconds >= death.atSeconds - 10);
    const dyingUnit = unitsByName.get(death.name);
    const dyingHpBefore = dyingUnit ? getHpPercentAtTime(dyingUnit, death.atSeconds - 5, matchStartMs) : null;
    const hpContext = dyingHpBefore !== null ? ` Player was at ${Math.round(dyingHpBefore)}% HP 5s before death.` : '';
    const whatHappened = nearbyGap
      ? `${death.spec} died at ${fmtTime(death.atSeconds)}.${hpContext} A ${nearbyGap.durationSeconds.toFixed(1)}s healing gap (${nearbyGap.freeCastSeconds.toFixed(1)}s free-cast) was active from ${fmtTime(nearbyGap.fromSeconds)} — healer was not CC'd during this time.`
      : `${death.spec} died at ${fmtTime(death.atSeconds)}.${hpContext}`;
    const dyingPlayerCC = ccTrinketSummaries.find((s) => s.playerName === death.name);
    const rootCauseTrace = buildDeathRootCauseTrace(death.atSeconds, cooldowns, dyingPlayerCC, dyingUnit, matchStartMs);
    const { mechanicalAvailability, interpretation, tieredOptions, finalAssessment } = buildKillMomentFields(
      death.atSeconds,
      cooldowns,
      dyingPlayerCC,
      constrainedTradePreceded,
      dyingHpBefore,
    );
    moments.push({
      timeSeconds: death.atSeconds,
      impactScore: 100,
      impactLabel: 'Critical',
      roleLabel: 'Kill',
      title: `${death.spec} death`,
      enemyState,
      friendlyState: cdState,
      whatHappened,
      mechanicalAvailability,
      interpretation,
      tieredOptions,
      finalAssessment,
      availableOptions: cdState,
      uncertainty:
        dyingHpBefore !== null
          ? 'Log cannot confirm healer position or line-of-sight at time of death. Cause of death may involve prior damage not reflected in the nearest pressure window.'
          : 'Log cannot confirm healer position, line-of-sight, or exact HP% at time of death. Cause of death may involve prior damage not reflected in the nearest pressure window.',
      isDeath: true,
      rootCauseTrace,
    });
  }

  // 2. Free-cast healing gaps during pressure (healer only — not already tied to a death)
  if (isHealer) {
    for (const gap of healingGaps) {
      const tiedToDeath = friendlyDeaths.some(
        (d) => gap.fromSeconds <= d.atSeconds && gap.toSeconds >= d.atSeconds - 10,
      );
      if (tiedToDeath) continue;
      const midpoint = gap.fromSeconds + gap.durationSeconds / 2;
      const enemyState = getEnemyStateAtTime(midpoint, enemyCDTimeline);
      const cdState = getOwnerCDsAvailable(gap.fromSeconds, cooldowns);
      const dmgK = Math.round(gap.mostDamagedAmount / 1000);
      const score = Math.min(85, 40 + gap.mostDamagedAmount / 150_000);
      const gapContributingDeath = findContributingDeath(gap.fromSeconds, friendlyDeaths);
      moments.push({
        timeSeconds: gap.fromSeconds,
        impactScore: score,
        impactLabel: score >= 70 ? 'High' : 'Moderate',
        roleLabel: gapContributingDeath ? 'Setup' : 'Trade',
        title: `Healing gap — ${gap.mostDamagedSpec} took ${dmgK}k while healer had free-cast time`,
        enemyState,
        friendlyState: `Healer had ${gap.freeCastSeconds.toFixed(1)}s free-cast time in a ${gap.durationSeconds.toFixed(1)}s gap. ${cdState}`,
        whatHappened: `Healer cast no heals or spells from ${fmtTime(gap.fromSeconds)} to ${fmtTime(gap.toSeconds)} (${gap.durationSeconds.toFixed(1)}s total, ${gap.freeCastSeconds.toFixed(1)}s free). ${gap.mostDamagedSpec} (${gap.mostDamagedName}) took ${dmgK}k damage.`,
        mechanicalAvailability: [],
        interpretation: [],
        availableOptions: `Healer had free-cast time — instant-cast heals and available CDs were options. ${cdState}`,
        uncertainty:
          'Log cannot confirm healer position or LoS. Mana state is not tracked. The gap may reflect intentional repositioning not visible in combat events.',
        contributingDeathSpec: gapContributingDeath?.spec,
        contributingDeathAtSeconds: gapContributingDeath?.atSeconds,
      });
    }
  }

  // 3. Panic defensives — CD used during no real pressure
  for (const panic of panicDefensives) {
    const enemyState = getEnemyStateAtTime(panic.timeSeconds, enemyCDTimeline);
    const cdState = getOwnerCDsAvailable(panic.timeSeconds, cooldowns);
    const panicContributingDeath = findContributingDeath(panic.timeSeconds, friendlyDeaths);
    const panicTargetHpNote = hpPctNote(unitsByName.get(panic.targetName), panic.timeSeconds);
    moments.push({
      timeSeconds: panic.timeSeconds,
      impactScore: 60,
      impactLabel: 'High',
      roleLabel: panicContributingDeath ? 'Setup' : 'Trade',
      title: `Panic defensive — ${panic.spellName} used with no enemy burst detected`,
      enemyState,
      friendlyState: cdState,
      whatHappened: `${panic.casterSpec} (${panic.casterName}) cast ${panic.spellName} on ${panic.targetSpec} (${panic.targetName})${panicTargetHpNote} at ${fmtTime(panic.timeSeconds)}, but no significant enemy pressure was detected in the surrounding 7-second window.`,
      mechanicalAvailability: [],
      interpretation: [],
      availableOptions: `Holding ${panic.spellName} for a confirmed burst window would provide stronger coverage at the cost of a potentially risky undefended interval.`,
      uncertainty: panicTargetHpNote
        ? 'Log may miss absorbed damage that preceded the cast. Enemy intent cannot be fully confirmed from combat log events alone.'
        : 'Log may miss absorbed damage that preceded the cast. Enemy intent and exact HP% cannot be confirmed from combat log events alone.',
      contributingDeathSpec: panicContributingDeath?.spec,
      contributingDeathAtSeconds: panicContributingDeath?.atSeconds,
    });
  }

  // 4. Overlapped defensives
  for (const overlap of overlappedDefensives) {
    const enemyState = getEnemyStateAtTime(overlap.timeSeconds, enemyCDTimeline);
    const overlapContributingDeath = findContributingDeath(overlap.timeSeconds, friendlyDeaths);
    const overlapTargetHpNote = hpPctNote(unitsById.get(overlap.targetUnitId), overlap.timeSeconds);
    moments.push({
      timeSeconds: overlap.timeSeconds,
      impactScore: 50,
      impactLabel: 'Moderate',
      roleLabel: overlapContributingDeath ? 'Setup' : 'Trade',
      title: `Defensive overlap — ${overlap.firstSpellName} + ${overlap.secondSpellName} simultaneously on ${overlap.targetName}`,
      enemyState,
      friendlyState: `${overlap.firstCasterSpec} used ${overlap.firstSpellName} at ${fmtTime(overlap.timeSeconds)}; ${overlap.secondCasterSpec} used ${overlap.secondSpellName} at ${fmtTime(overlap.secondCastTimeSeconds)} — simultaneous for ${overlap.simultaneousSeconds.toFixed(1)}s.`,
      whatHappened: `Two major defensives were stacked on ${overlap.targetName}${overlapTargetHpNote} for ${overlap.simultaneousSeconds.toFixed(1)}s of overlapping coverage, wasting effective duration of one CD.`,
      mechanicalAvailability: [],
      interpretation: [],
      availableOptions: `Staggering the CDs would extend total coverage by ~${Math.round(overlap.simultaneousSeconds)}s. Optimal: ${overlap.secondCasterSpec} waits for ${overlap.firstSpellName} to expire before pressing ${overlap.secondSpellName}.`,
      uncertainty: overlapTargetHpNote
        ? 'Assess whether simultaneous stacking was necessary given target HP% shown above. Absorbed damage before the second cast is not tracked.'
        : 'Cannot determine if simultaneous stacking was required to survive a spike — HP values during this window are not fully tracked in the log.',
      contributingDeathSpec: overlapContributingDeath?.spec,
      contributingDeathAtSeconds: overlapContributingDeath?.atSeconds,
    });
  }

  // Sort and limit before role refinement so we work on the final set
  const sorted = moments.sort((a, b) => b.impactScore - a.impactScore).slice(0, 5);

  // Refine roles on the final sorted set:
  // - Trade with no contributingDeathAtSeconds → Standalone
  // - Setup: first moment pointing to a given death timestamp keeps Setup; subsequent ones → Consequence
  const claimedDeathTimestamps = new Set<number>();
  for (const m of sorted) {
    if (m.roleLabel === 'Trade') {
      if (m.contributingDeathAtSeconds === undefined) {
        m.roleLabel = 'Standalone';
      }
      // Trade with contributingDeathAtSeconds stays as Setup (already assigned in event loops above)
    }
    if (m.roleLabel === 'Setup') {
      const key = Math.round(m.contributingDeathAtSeconds ?? -1);
      if (claimedDeathTimestamps.has(key)) {
        m.roleLabel = 'Consequence';
      } else {
        claimedDeathTimestamps.add(key);
      }
    }
  }

  return {
    moments: sorted,
    constrainedTrade: constrainedTradePreceded,
  };
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds a brief event-driven Match Flow narrative from burst windows and CD trades.
 * Segments are defined by burst windows (not time slices) so the LLM sees
 * Opening Burst → Post-Trade Window → Final Burst/Phase in causal order.
 *
 * @deprecated Replaced by `buildMatchArc` in production. Retained for test coverage only.
 * @internal Do not use in production prompt builders. Not exported from the public surface.
 */
export function buildMatchFlow(
  enemyCDTimeline: IEnemyCDTimeline,
  ownerCooldowns: IMajorCooldownInfo[],
  allTeamCooldownsWithPlayer: Array<{ player: ICombatUnit; cd: IMajorCooldownInfo }>,
  friendlyDeaths: Array<{ spec: string; atSeconds: number }>,
  durationSeconds: number,
): string[] {
  const lines: string[] = [];
  const bursts = [...enemyCDTimeline.alignedBurstWindows].sort((a, b) => a.fromSeconds - b.fromSeconds);
  const firstDeath = friendlyDeaths[0];

  lines.push('MATCH FLOW:');
  lines.push('');

  if (bursts.length === 0) {
    lines.push('  No coordinated enemy bursts detected — match resolved through sustained pressure.');
    if (firstDeath) lines.push(`  → ${firstDeath.spec} died at ${fmtTime(firstDeath.atSeconds)}.`);
    lines.push('');
    return lines;
  }

  const firstBurst = bursts[0];

  // Segment 1: Opening burst
  lines.push(`  Opening Burst (${fmtTime(firstBurst.fromSeconds)}–${fmtTime(firstBurst.toSeconds)}):`);
  const burstCDNames = firstBurst.activeCDs.map((c) => c.spellName).join(' + ');
  lines.push(`    - Enemy aligned burst (${firstBurst.dangerLabel} — ${burstCDNames})`);

  // Defensive CDs traded into this burst (owner + teammates)
  const tradedDefItems: Array<{ spec: string; spellName: string; cooldownSeconds: number }> = [];
  for (const { player, cd } of allTeamCooldownsWithPlayer) {
    if (cd.tag !== 'Defensive') continue;
    const traded = cd.casts.find(
      (c) => c.timeSeconds >= firstBurst.fromSeconds - 5 && c.timeSeconds <= firstBurst.toSeconds + 5,
    );
    if (traded) {
      tradedDefItems.push({
        spec: specToString(player.spec),
        spellName: cd.spellName,
        cooldownSeconds: cd.cooldownSeconds,
      });
    }
  }

  if (tradedDefItems.length > 0) {
    const formatted = tradedDefItems.map((item) => `${item.spec}'s ${item.spellName}`).join(' + ');
    lines.push(`    - Team responded: ${formatted} committed`);
  } else {
    lines.push(`    - No major defensive CDs traded into this burst`);
  }

  // Check if match duration is shorter than the shortest traded team defensive CD's cooldown
  if (tradedDefItems.length > 0) {
    const minCooldown = Math.min(...tradedDefItems.map((item) => item.cooldownSeconds));
    if (durationSeconds < minCooldown) {
      lines.push(
        `    - Match duration (${fmtTime(durationSeconds)}) did not allow recovery of these major cooldowns after this trade`,
      );
      lines.push(`    - This match contained only one full cooldown cycle for the committed defensive abilities`);
    }
  }
  lines.push('');

  // Segment 2: Post-trade window (between first and second burst, or first burst and death)
  const secondBurst = bursts[1];
  const midEnd = secondBurst ? secondBurst.fromSeconds : firstDeath ? firstDeath.atSeconds - 5 : durationSeconds - 5;
  if (midEnd - firstBurst.toSeconds > 5) {
    lines.push(`  Post-Trade Window (${fmtTime(firstBurst.toSeconds)}–${fmtTime(midEnd)}):`);
    const ownerDefsAvailableInWindow = ownerCooldowns.filter((cd) => {
      if (cd.tag !== 'Defensive') return false;
      const lastCast = lastCastBefore(cd, firstBurst.toSeconds);
      if (!lastCast) return true; // never-used or not yet cast — still available
      return lastCast.timeSeconds + cd.cooldownSeconds <= midEnd;
    });
    if (ownerDefsAvailableInWindow.length === 0) {
      lines.push(`    - No major defensive CDs available on owner during this window`);
    }
    if (!secondBurst) {
      lines.push(`    - No coordinated enemy burst — both sides recovering CDs`);
    }
    lines.push('');
  }

  // Segment 3: Final burst or final phase
  const finalBurst = bursts.length >= 2 ? bursts[bursts.length - 1] : undefined;
  const finalEndTime = firstDeath?.atSeconds ?? durationSeconds;

  if (finalBurst) {
    lines.push(`  Final Burst (${fmtTime(finalBurst.fromSeconds)}–${fmtTime(finalEndTime)}):`);
    const finalCDNames = finalBurst.activeCDs.map((c) => c.spellName).join(' + ');
    lines.push(`    - Enemy burst (${finalBurst.dangerLabel} — ${finalCDNames})`);
  } else {
    lines.push(`  Final Phase (${fmtTime(firstBurst.toSeconds)}–${fmtTime(finalEndTime)}):`);
  }

  // Owner defensive CD state at death / match end
  const spentAtEnd = ownerCooldowns
    .filter((cd) => cd.tag === 'Defensive')
    .filter((cd) => {
      const lastCast = lastCastBefore(cd, finalEndTime);
      if (!lastCast) return false;
      return lastCast.timeSeconds + cd.cooldownSeconds > finalEndTime;
    })
    .map((cd) => cd.spellName);
  if (spentAtEnd.length > 0) {
    lines.push(`    - ${firstDeath ? 'At death' : 'At match end'}: ${spentAtEnd.join(', ')} on cooldown`);
  }
  if (firstDeath) {
    lines.push(`    - → ${firstDeath.spec} died at ${fmtTime(firstDeath.atSeconds)}`);
  } else {
    lines.push(`    - → No friendly deaths — match ended in a win`);
  }
  lines.push('');

  return lines;
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds a compact 3-sentence match arc (Early / Mid / Late) before the CRITICAL MOMENTS
 * section, so the LLM understands match flow before evaluating individual moments.
 *
 * Phase boundaries (per AI_CONTEXT_REFACTOR.md):
 *   Early: match start → first major defensive used by either team
 *   Mid:   first defensive → first friendly death OR first burst window resolved
 *   Late:  that boundary → match end
 *
 * Edge cases:
 *   - Match < 90s: collapse to two phases (Pressure / Death or Resolution)
 *   - 3v3 + duration > 180s + no deaths: Late = "dampening reached"
 *   - Win with no friendly deaths: three phases still emitted; Late describes kill finish
 */
export function buildMatchArc(
  enemyCDTimeline: IEnemyCDTimeline,
  allTeamCooldownsWithPlayer: Array<{ player: ICombatUnit; cd: IMajorCooldownInfo }>,
  friendlyDeaths: Array<{ spec: string; atSeconds: number }>,
  durationSeconds: number,
  bracket: string,
): string[] {
  const lines: string[] = [];
  lines.push('MATCH ARC:');

  // Edge case: very short match — collapse to two phases
  if (durationSeconds < 90) {
    const mid = Math.round(durationSeconds / 2);
    lines.push(`  Pressure (0:00–${fmtTime(mid)}): Early pressure established — no recovery window.`);
    if (friendlyDeaths.length > 0) {
      const d = friendlyDeaths[0];
      lines.push(
        `  Death (${fmtTime(mid)}–${fmtTime(durationSeconds)}): ${d.spec} died at ${fmtTime(d.atSeconds)} — speed kill.`,
      );
    } else {
      lines.push(
        `  Resolution (${fmtTime(mid)}–${fmtTime(durationSeconds)}): Match resolved quickly — no friendly deaths.`,
      );
    }
    return lines;
  }

  const burstsSorted = [...enemyCDTimeline.alignedBurstWindows].sort((a, b) => a.fromSeconds - b.fromSeconds);
  const firstBurst = burstsSorted[0] ?? null;
  const firstDeath = friendlyDeaths[0];

  // Find first defensive cast from either team
  let firstDefensiveSeconds = Infinity;
  let firstDefensiveName = '';
  let firstDefensiveSpec = '';
  for (const { player, cd } of allTeamCooldownsWithPlayer) {
    if (cd.tag !== 'Defensive' || cd.neverUsed || cd.casts.length === 0) continue;
    const cast = cd.casts[0];
    if (cast.timeSeconds < firstDefensiveSeconds) {
      firstDefensiveSeconds = cast.timeSeconds;
      firstDefensiveName = cd.spellName;
      firstDefensiveSpec = specToString(player.spec);
    }
  }

  // Phase boundaries
  const earlyEnd = firstDefensiveSeconds < Infinity ? firstDefensiveSeconds : durationSeconds / 2;
  const firstBurstResolved = firstBurst !== null ? firstBurst.toSeconds : Infinity;
  const firstFriendlyDeathSeconds = firstDeath?.atSeconds ?? Infinity;
  const midEnd = Math.min(firstFriendlyDeathSeconds, firstBurstResolved);
  // Clamp lateStart >= earlyEnd to prevent inverted phase ranges (e.g. "Mid (1:11–0:53)")
  // when a death/burst occurs before the first defensive is spent.
  const rawLateStart = midEnd < Infinity ? midEnd : earlyEnd + (durationSeconds - earlyEnd) / 2;
  const lateStart = Math.max(earlyEnd, rawLateStart);

  // Early phase prose
  const earlyBursts = burstsSorted.filter((b) => b.fromSeconds < earlyEnd);
  let earlyProse: string;
  if (earlyBursts.length > 0) {
    const burst = earlyBursts[0];
    const cdNames = burst.activeCDs.map((c) => c.spellName).join(' + ');
    earlyProse = `Enemy aligned burst established pressure (${burst.dangerLabel} — ${cdNames}); no major defensives spent.`;
  } else if (firstDefensiveSeconds === Infinity) {
    earlyProse = 'No coordinated burst; match opened with sustained pressure and no defensive CDs committed.';
  } else {
    earlyProse = 'No coordinated enemy burst in opening phase; sustained/DoT pressure building.';
  }
  lines.push(`  Early (0:00–${fmtTime(earlyEnd)}): ${earlyProse}`);

  // Mid phase prose — skip if zero-duration (earlyEnd === lateStart, e.g. first death/burst before first defensive)
  if (earlyEnd < lateStart) {
    let midProse: string;
    if (firstDefensiveSeconds < Infinity) {
      const midBursts = burstsSorted.filter((b) => b.fromSeconds >= earlyEnd && b.fromSeconds < lateStart);
      const burstNote =
        midBursts.length > 0
          ? ` in response to ${midBursts[0].dangerLabel} burst at ${fmtTime(midBursts[0].fromSeconds)}`
          : '';
      midProse = `${firstDefensiveSpec}'s ${firstDefensiveName} committed${burstNote} — limited major CD coverage remaining.`;
    } else {
      midProse = 'No major defensive CDs committed; match progressed through sustained pressure.';
    }
    lines.push(`  Mid (${fmtTime(earlyEnd)}–${fmtTime(lateStart)}): ${midProse}`);
  }

  // Late phase prose
  let lateProse: string;
  const lateBursts = burstsSorted.filter((b) => b.fromSeconds >= lateStart);
  const lateBurstNote =
    lateBursts.length > 0 ? `Second burst (${lateBursts[0].dangerLabel}) aligned with` : 'Pressure continued with';
  if (firstDeath) {
    lateProse = `${lateBurstNote} limited defensive options → ${firstDeath.spec} died at ${fmtTime(firstDeath.atSeconds)}.`;
  } else if (bracket === '3v3' && durationSeconds > 180) {
    lateProse = 'Dampening reached — healing reduced; match extended to kill window.';
  } else {
    lateProse = 'Match concluded — no friendly deaths; pressure neutralized.';
  }
  lines.push(`  Late (${fmtTime(lateStart)}–${fmtTime(durationSeconds)}): ${lateProse}`);

  return lines;
}

// ── Timeline prompt builders ───────────────────────────────────────────────

/**
 * Formats the PLAYER LOADOUT section for the raw timeline prompt.
 * Lists all major CDs (≥30s) available to each player — no usage annotations,
 * no NEVER USED labeling. Absence from the timeline is the signal.
 *
 * Returns both the formatted text and a playerIdMap (name → numeric ID, 1-based)
 * for use in buildMatchTimeline to compress player names to short IDs.
 */
export function buildPlayerLoadout(
  owner: ICombatUnit,
  ownerSpec: string,
  ownerCDs: IMajorCooldownInfo[],
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>,
  enemyCDTimeline: IEnemyCDTimeline,
  enemies?: ICombatUnit[],
): {
  text: string;
  playerIdMap: Map<string, number>;
  friendlyIdMap: Map<string, number>;
  enemyIdMap: Map<string, number>;
} {
  const lines: string[] = [];
  lines.push('PLAYER LOADOUT (major CDs ≥30s available this match)');

  // Use separate maps to prevent a friendly and enemy sharing a display name from
  // overwriting each other's ID entry.  The combined playerIdMap returned uses a
  // "friendly:name" / "enemy:name" internal key that pid() resolves correctly.
  const friendlyIdMap = new Map<string, number>();
  const enemyIdMap = new Map<string, number>();
  let nextId = 1;

  const fmtCDLabel = (cd: IMajorCooldownInfo) =>
    `${cd.spellName} [${cd.cooldownSeconds}s${cd.maxChargesDetected > 1 ? `, ${cd.maxChargesDetected} Charges` : ''}]`;
  const ownerCDStr = ownerCDs.length > 0 ? ownerCDs.map(fmtCDLabel).join(', ') : 'none tracked';
  const ownerId = nextId++;
  friendlyIdMap.set(owner.name, ownerId);
  lines.push(`  ${ownerId}: ${owner.name} (${ownerSpec} — log owner):`);
  lines.push(`    ${ownerCDStr}`);

  for (const { player, spec, cds } of teammateCDs) {
    const cdStr = cds.length > 0 ? cds.map(fmtCDLabel).join(', ') : 'none tracked';
    const pid = nextId++;
    friendlyIdMap.set(player.name, pid);
    lines.push(`  ${pid}: ${player.name} (${spec}):`);
    lines.push(`    ${cdStr}`);
  }

  for (const player of enemyCDTimeline.players) {
    const pid = nextId++;
    enemyIdMap.set(player.playerName, pid);
    const seen = new Set<string>();
    const uniqueCDs: string[] = [];
    for (const cd of player.offensiveCDs) {
      const key = `${cd.spellName}|${cd.cooldownSeconds}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueCDs.push(`${cd.spellName} [${cd.cooldownSeconds}s]`);
      }
    }
    lines.push(`  ${pid}: ${player.playerName} (${player.specName} — enemy):`);
    lines.push(`    ${uniqueCDs.length > 0 ? uniqueCDs.join(', ') : 'none tracked'}`);
  }

  // Assign IDs to any enemy units not already covered by enemyCDTimeline.players
  // (enemies who never cast a tracked offensive CD are absent from the timeline).
  for (const enemy of enemies ?? []) {
    if (enemyIdMap.has(enemy.name)) continue;
    const pid = nextId++;
    enemyIdMap.set(enemy.name, pid);
    lines.push(`  ${pid}: ${enemy.name} (${specToString(enemy.spec)} — enemy):`);
    lines.push(`    none tracked`);
  }

  // Build a combined playerIdMap that encodes side to avoid key collision.
  // buildMatchTimeline's pid() function uses this map; friendly names are tried
  // first (covering owner + teammates), then enemy names.
  const playerIdMap = new Map<string, number>();
  for (const [name, id] of friendlyIdMap) playerIdMap.set(name, id);
  // Enemy names are added with a sentinel suffix internally so that a name collision
  // does not silently overwrite the friendly entry.  We store them under
  // "\x00enemy:name" — a key that normal lookups by display name will never hit.
  // The buildMatchTimeline pid() helper resolves enemy names via enemyIdMap which
  // is included in the returned object.
  for (const [name, id] of enemyIdMap) playerIdMap.set('\x00enemy:' + name, id);

  return { text: lines.join('\n'), playerIdMap, friendlyIdMap, enemyIdMap };
}

// ── buildResourceSnapshot ──────────────────────────────────────────────────

export interface ResourceSnapshotParams {
  timeSeconds: number;
  ownerCDs: IMajorCooldownInfo[];
  ownerName: string;
  ownerSpec: string;
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>;
  ccTrinketSummaries: IPlayerCCTrinketSummary[];
  enemyCDTimeline: IEnemyCDTimeline;
  playerIdMap?: Map<string, number>;
  /** Pre-computed enemy buff intervals from extractEnemyMajorBuffIntervals. */
  enemyBuffIntervals?: Map<string, IEnemyBuffInterval[]>;
  /** Enemy player name → numeric ID. Used to compress enemy names in [ENEMY BUFFS]. */
  enemyIdMap?: Map<string, number>;
}

export function buildResourceSnapshot({
  timeSeconds,
  ownerCDs,
  ownerName,
  ownerSpec,
  teammateCDs,
  ccTrinketSummaries,
  enemyCDTimeline,
  playerIdMap,
  enemyBuffIntervals,
  enemyIdMap,
}: ResourceSnapshotParams): string[] {
  function pid(name: string): string {
    if (!playerIdMap) return name;
    const id = playerIdMap.get(name);
    return id !== undefined ? String(id) : name;
  }

  // ── Line 1: Friendly ready / On CD ────────────────────────────────────────
  const readyNames: string[] = [];
  const onCDParts: string[] = [];

  const allFriendlyCDs: Array<{ spellName: string; cd: IMajorCooldownInfo }> = [
    ...ownerCDs.map((cd) => ({ spellName: cd.spellName, cd })),
    ...teammateCDs.flatMap(({ cds }) => cds.map((cd) => ({ spellName: cd.spellName, cd }))),
  ];

  for (const { spellName, cd } of allFriendlyCDs) {
    // Casts strictly before this timestamp (exclude the current cast being annotated)
    const priorCasts = cd.casts.filter((c) => c.timeSeconds < timeSeconds - 0.5);

    if (priorCasts.length === 0) {
      // Never used before T — available unless match just started (5s grace)
      if (timeSeconds > 5) readyNames.push(spellName);
      continue;
    }

    // For multi-charge CDs, check whether all charge slots are consumed.
    const charges = cd.maxChargesDetected > 1 ? cd.maxChargesDetected : 1;
    const relevantCasts = priorCasts.slice(-charges); // last N casts, one per slot
    const earliestSlotReady = relevantCasts[0].timeSeconds + cd.cooldownSeconds;

    if (earliestSlotReady <= timeSeconds + 0.5) {
      readyNames.push(spellName);
    } else {
      const remaining = Math.round(earliestSlotReady - timeSeconds);
      onCDParts.push(`${spellName} (${remaining}s)`);
    }
  }

  const friendlyLine =
    `      [RESOURCES]  Friendly ready: ${readyNames.length > 0 ? readyNames.join(', ') : '—'}` +
    ` | On CD: ${onCDParts.length > 0 ? onCDParts.join(', ') : '—'}`;

  // ── Line 2: Enemy active offensive CDs (cast in last 30s) ─────────────────
  const enemyActiveParts: string[] = [];
  for (const player of enemyCDTimeline.players) {
    for (const cd of player.offensiveCDs) {
      const agoSeconds = timeSeconds - cd.castTimeSeconds;
      if (agoSeconds >= 0 && agoSeconds <= 30) {
        enemyActiveParts.push(`${cd.spellName} (${player.specName}, cast ${Math.round(agoSeconds)}s ago)`);
      }
    }
  }
  const enemyLine =
    `                   Enemy active: ` +
    (enemyActiveParts.length > 0 ? enemyActiveParts.join(', ') : '— (no offensive CD in last 30s)');

  // ── Line 3: CC state for every friendly player ────────────────────────────
  const summaryByName = new Map(ccTrinketSummaries.map((s) => [s.playerName, s]));

  const allFriendlyPlayers: Array<{ name: string; spec: string }> = [
    { name: ownerName, spec: ownerSpec },
    ...teammateCDs.map(({ player, spec }) => ({ name: player.name, spec })),
  ];

  const ccParts: string[] = [];
  for (const { name, spec } of allFriendlyPlayers) {
    const summary = summaryByName.get(name);
    const shortSpec = spec.split(' ').at(-1) ?? spec; // "Discipline Priest" → "Priest"
    const playerLabel = `${pid(name)} (${shortSpec})`;

    const activeCC = summary?.ccInstances.find(
      (cc) => cc.atSeconds <= timeSeconds && timeSeconds < cc.atSeconds + cc.durationSeconds,
    );

    if (!activeCC) {
      ccParts.push(`${playerLabel} free`);
      continue;
    }

    const remaining = Math.round(activeCC.atSeconds + activeCC.durationSeconds - timeSeconds);
    const isStun = activeCC.drInfo?.category === 'Stun';
    const castLockTag = isStun ? ' [CAST-LOCKED]' : '';

    // If player is physically stunned but a cast appears at this timestamp,
    // they must have used their trinket to break the stun.
    const trinketUsedNow = summary?.trinketUseTimes.some((t) => Math.abs(t - timeSeconds) <= 1) ?? false;
    const trinketTag = isStun && trinketUsedNow ? ' [used trinket to break]' : '';

    ccParts.push(`${playerLabel} ${activeCC.spellName} ${remaining}s left${castLockTag}${trinketTag}`);
  }

  const ccLine = `                   CC state: ${ccParts.join(' | ')}`;

  // ── Line 4: Enemy active major buffs (F67) ────────────────────────────────
  const enemyBuffParts: string[] = [];
  if (enemyBuffIntervals) {
    const enemyBuffPid = (name: string): string => {
      if (!enemyIdMap) return name;
      const id = enemyIdMap.get(name);
      return id !== undefined ? String(id) : name;
    };
    for (const [enemyName, intervals] of enemyBuffIntervals) {
      const activeBuffs = intervals.filter((i) => i.startSeconds <= timeSeconds && timeSeconds < i.endSeconds);
      for (const buff of activeBuffs) {
        const remaining = Math.max(0, Math.round(buff.endSeconds - timeSeconds));
        const purgeNote = buff.purgeable ? ' [PURGEABLE]' : '';
        enemyBuffParts.push(`${enemyBuffPid(enemyName)}:${buff.spellName} (${remaining}s left${purgeNote})`);
      }
    }
  }

  const buffLine = enemyBuffParts.length > 0 ? `                   [ENEMY BUFFS]  ${enemyBuffParts.join(' | ')}` : null;

  return buffLine !== null ? [friendlyLine, enemyLine, ccLine, buffLine] : [friendlyLine, enemyLine, ccLine];
}

// ── buildMatchTimeline ─────────────────────────────────────────────────────

export interface BuildMatchTimelineParams {
  owner: ICombatUnit;
  ownerSpec: string;
  ownerCDs: IMajorCooldownInfo[];
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>;
  enemyCDTimeline: IEnemyCDTimeline;
  ccTrinketSummaries: IPlayerCCTrinketSummary[];
  dispelSummary: IDispelSummary;
  friendlyDeaths: Array<{ spec: string; name: string; atSeconds: number }>;
  enemyDeaths: Array<{ spec: string; name: string; atSeconds: number }>;
  pressureWindows: IDamageBucket[];
  healingGaps: IHealingGap[];
  friends: ICombatUnit[];
  /**
   * Enemy player units. When provided, their HP is included in [HP] ticks
   * alongside friendly HP, referenced by enemyPid() numeric ID.
   */
  enemies?: ICombatUnit[];
  matchStartMs: number;
  matchEndMs: number;
  isHealer: boolean;
  /**
   * Friendly player name → numeric ID mapping from buildPlayerLoadout.
   * When provided, friendly names are compressed to short IDs in the timeline.
   */
  playerIdMap?: Map<string, number>;
  /**
   * Enemy player name → numeric ID mapping from buildPlayerLoadout.
   * Required alongside playerIdMap to avoid collision when a friendly and enemy
   * share the same display name.
   */
  enemyIdMap?: Map<string, number>;
  /**
   * AoE CC chains cast by friendly players on enemies. When provided,
   * [CC CAST] events are emitted for AoE spells (non-single-target spells).
   */
  outgoingCCChains?: IOutgoingCCChain[];
}

export function buildMatchTimeline(params: BuildMatchTimelineParams): string {
  const {
    owner,
    ownerSpec,
    ownerCDs,
    teammateCDs,
    enemyCDTimeline,
    ccTrinketSummaries,
    dispelSummary,
    friendlyDeaths,
    enemyDeaths,
    pressureWindows,
    healingGaps,
    friends,
    enemies,
    matchStartMs,
    matchEndMs,
    isHealer,
    playerIdMap,
    enemyIdMap,
    outgoingCCChains,
  } = params;

  const enemyBuffIntervals = extractEnemyMajorBuffIntervals(enemies ?? [], matchStartMs, matchEndMs);

  /**
   * Returns the short numeric ID for a friendly player name, or the raw name
   * if no mapping exists.  Enemy names must be resolved via enemyPid() to avoid
   * ID collision when a friendly and enemy share a display name.
   */
  function pid(name: string): string {
    if (!playerIdMap) return name;
    const id = playerIdMap.get(name);
    return id !== undefined ? String(id) : name;
  }

  /** Returns the short numeric ID for an *enemy* player name, falling back to name. */
  function enemyPid(name: string): string {
    if (!enemyIdMap) return name;
    const id = enemyIdMap.get(name);
    return id !== undefined ? String(id) : name;
  }

  /**
   * Resolves a cast's destUnitName to a display label for [OWNER CAST] entries.
   * Returns "self" for self-casts, a numeric ID for known players, or the raw name.
   * Returns "" when destUnitName is empty (AoE spells with no specific log target).
   */
  function resolveTarget(destUnitName: string | null | undefined): string {
    if (!destUnitName || destUnitName === 'nil') return '';
    if (destUnitName === owner.name) return 'self';
    if (playerIdMap) {
      const id = playerIdMap.get(destUnitName);
      if (id !== undefined) return String(id);
    }
    if (enemyIdMap) {
      const id = enemyIdMap.get(destUnitName);
      if (id !== undefined) return String(id);
    }
    return destUnitName;
  }

  function resourceSnapshot(timeSeconds: number): string[] {
    return buildResourceSnapshot({
      timeSeconds,
      ownerCDs,
      ownerName: owner.name,
      ownerSpec,
      teammateCDs,
      ccTrinketSummaries,
      enemyCDTimeline,
      playerIdMap,
      enemyBuffIntervals,
      enemyIdMap,
    });
  }

  const entries: Array<{ timeSeconds: number; lines: string[] }> = [];

  function addEntry(timeSeconds: number, ...lines: string[]) {
    entries.push({ timeSeconds, lines });
  }

  // ── [DEATH] events ────────────────────────────────────────────────────────

  const unitsByName = new Map(friends.map((u) => [u.name, u]));

  for (const death of friendlyDeaths) {
    const deathLines: string[] = [
      `${fmtTime(death.atSeconds)}  [DEATH]  ${pid(death.name)} (${death.spec} — friendly)`,
    ];

    const dyingUnit = unitsByName.get(death.name);
    if (dyingUnit) {
      // HP trajectory
      const checkpoints = [15, 10, 5, 3];
      const trajectory: string[] = [];
      for (const secondsBefore of checkpoints) {
        const pct = getHpPercentAtTime(dyingUnit, death.atSeconds - secondsBefore, matchStartMs);
        if (pct !== null) trajectory.push(`${Math.round(pct)}% at T-${secondsBefore}s`);
      }
      if (trajectory.length > 0) {
        deathLines.push(`               HP: ${trajectory.join(' → ')} → dead`);
      }

      // Top damage sources in final 10s — uses shared helper to avoid duplication
      const deathMs = matchStartMs + death.atSeconds * 1000;
      const topSources = getTopDamageSourcesInWindow(dyingUnit, deathMs, 10_000);
      if (topSources.length > 0) {
        deathLines.push(`               Top damage in final 10s: ${topSources.join(', ')}`);
      }
    }

    addEntry(death.atSeconds, ...deathLines);
  }

  for (const death of enemyDeaths) {
    addEntry(death.atSeconds, `${fmtTime(death.atSeconds)}  [DEATH]  ${enemyPid(death.name)} (${death.spec} — enemy)`);
  }

  // ── [OWNER CD] events ───────────────────────────────────────────────────────

  for (const cd of ownerCDs) {
    for (const cast of cd.casts) {
      const targetPart =
        cast.targetName !== undefined
          ? ` → ${pid(cast.targetName)}${cast.targetHpPct !== undefined ? ` (${cast.targetHpPct}% HP)` : ''}`
          : '';
      addEntry(
        cast.timeSeconds,
        `${fmtTime(cast.timeSeconds)}  [OWNER CD]   ${cd.spellName}${targetPart}`,
        ...resourceSnapshot(cast.timeSeconds),
      );
    }
  }

  // ── [OWNER CAST] healer gap-filler (F61) ────────────────────────────────────

  if (isHealer) {
    const trackedCastsBySpellId = new Map<string, Set<number>>();
    for (const cd of ownerCDs) {
      trackedCastsBySpellId.set(
        cd.spellId,
        new Set(cd.casts.map((c) => matchStartMs + Math.round(c.timeSeconds * 1000))),
      );
    }
    const trinketUseTimesMs = new Set(
      ccTrinketSummaries.flatMap((s) => s.trinketUseTimes.map((t) => Math.round(matchStartMs + t * 1000))),
    );

    // F68: flat list of CC event ms timestamps for same-second disambiguation
    const ccMsTimestamps: number[] = ccTrinketSummaries.flatMap((s) =>
      s.ccInstances.map((cc) => Math.round(matchStartMs + cc.atSeconds * 1000)),
    );

    for (const e of owner.spellCastEvents ?? []) {
      if (e.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
      if (!e.spellId) continue;
      const displayName = HEALER_CAST_SPELL_ID_TO_NAME[e.spellId] ?? e.spellName;
      if (!displayName) continue;
      const tsMs = e.logLine.timestamp;
      const trackedSet = trackedCastsBySpellId.get(e.spellId);
      if (trackedSet && (trackedSet.has(tsMs) || trackedSet.has(tsMs - 1000) || trackedSet.has(tsMs + 1000))) continue;
      if (trinketUseTimesMs.has(tsMs) || trinketUseTimesMs.has(tsMs - 1000) || trinketUseTimesMs.has(tsMs + 1000))
        continue;
      const timeSeconds = (tsMs - matchStartMs) / 1000;

      // F68: detect CC events in the same displayed second and annotate order
      const castDisplaySecond = Math.floor(timeSeconds);
      const sameTick = ccMsTimestamps.find((ccMs) => Math.floor((ccMs - matchStartMs) / 1000) === castDisplaySecond);
      let orderNote = '';
      if (sameTick !== undefined) {
        if (tsMs < sameTick) {
          orderNote = ' [completed before CC landed]';
        } else if (tsMs > sameTick) {
          orderNote = ' [succeeded after CC arrived — same second in log]';
        } else {
          orderNote = ' [same server tick as CC — cast succeeded per log]';
        }
      }

      const targetLabel = resolveTarget(e.destUnitName);
      const targetPart = targetLabel ? ` → ${targetLabel}` : '';
      addEntry(timeSeconds, `${fmtTime(timeSeconds)}  [OWNER CAST]   ${displayName}${targetPart}${orderNote}`);
    }
  }

  // ── [TEAMMATE CD] events ────────────────────────────────────────────────────

  for (const { player, spec, cds } of teammateCDs) {
    for (const cd of cds) {
      for (const cast of cd.casts) {
        addEntry(
          cast.timeSeconds,
          `${fmtTime(cast.timeSeconds)}  [TEAMMATE CD]   ${pid(player.name)} (${spec}): ${cd.spellName}`,
          ...resourceSnapshot(cast.timeSeconds),
        );
      }
    }
  }

  // ── [CC CAST] events — AoE CC cast by friendly players on enemies ──────────

  if (outgoingCCChains && outgoingCCChains.length > 0) {
    for (const event of extractAoeCCEvents(outgoingCCChains)) {
      const casterLabel = pid(event.casterName);
      const targetLabels = event.targets.map((t) => enemyPid(t.name)).join(', ');
      const countNote = event.targets.length > 1 ? ` [${event.targets.length} enemies]` : '';
      addEntry(
        event.atSeconds,
        `${fmtTime(event.atSeconds)}  [CC CAST]   ${event.spellName} (by ${casterLabel}) → ${targetLabels}${countNote}`,
      );
    }
  }

  // ── [ENEMY CD] events ──────────────────────────────────────────────────────

  for (const player of enemyCDTimeline.players) {
    for (const cd of player.offensiveCDs) {
      addEntry(
        cd.castTimeSeconds,
        `${fmtTime(cd.castTimeSeconds)}  [ENEMY CD]   ${enemyPid(player.playerName)} (${player.specName}): ${cd.spellName}`,
      );
    }
  }

  // ── [TRINKET] and [CC ON TEAM] events ──────────────────────────────────────

  for (const summary of ccTrinketSummaries) {
    for (const t of summary.trinketUseTimes) {
      addEntry(t, `${fmtTime(t)}  [TRINKET]   ${pid(summary.playerName)} used PvP trinket`);
    }

    for (const cc of summary.ccInstances) {
      const trinketNote =
        cc.trinketState === 'available_unused'
          ? ' | trinket: available, not used'
          : cc.trinketState === 'used'
            ? ' | trinket: used'
            : ' | trinket: on cooldown';
      addEntry(
        cc.atSeconds,
        `${fmtTime(cc.atSeconds)}  [CC ON TEAM]   ${pid(summary.playerName)} ← ${cc.spellName} (${pid(cc.sourceName)}) | ${cc.durationSeconds.toFixed(0)}s${trinketNote}`,
      );
    }
  }

  // ── [MISSED CLEANSE] and [CLEANSE] events ──────────────────────────────────

  for (const miss of dispelSummary.missedCleanseWindows) {
    const dmgK = Math.round(miss.postCcDamage / 1000);
    addEntry(
      miss.timeSeconds,
      `${fmtTime(miss.timeSeconds)}  [MISSED CLEANSE]   ${miss.spellName} on ${pid(miss.targetName)} | ${miss.durationSeconds.toFixed(0)}s | ${dmgK}k taken during | dispel: ${miss.dispelType}`,
    );
  }

  for (const cleanse of dispelSummary.allyCleanse) {
    addEntry(
      cleanse.timeSeconds,
      `${fmtTime(cleanse.timeSeconds)}  [CLEANSE]   ${pid(cleanse.sourceName)} dispelled ${cleanse.removedSpellName} off ${pid(cleanse.targetName)}`,
    );
  }

  // ── [DMG SPIKE] events ─────────────────────────────────────────────────────

  for (const pw of pressureWindows) {
    if (pw.totalDamage < DMG_SPIKE_THRESHOLD) continue;
    const dmgM = (pw.totalDamage / 1_000_000).toFixed(2);
    const windowSec = Math.round(pw.toSeconds - pw.fromSeconds);
    addEntry(
      pw.fromSeconds,
      `${fmtTime(pw.fromSeconds)}  [DMG SPIKE]   ${pid(pw.targetName)} (${pw.targetSpec}): ${dmgM}M in ${windowSec}s`,
    );
  }

  // ── [HEALING GAP] events (healer only) ────────────────────────────────────

  if (isHealer) {
    for (const gap of healingGaps) {
      addEntry(
        gap.fromSeconds,
        `${fmtTime(gap.fromSeconds)}  [HEALING GAP]   ${pid(owner.name)} inactive ${gap.durationSeconds.toFixed(1)}s (${gap.freeCastSeconds.toFixed(1)}s free) while ${pid(gap.mostDamagedName)} under pressure`,
      );
    }
  }

  // ── [HP] ticks — 1s resolution in critical windows, 3s elsewhere (F62) ──────

  const matchDurationS = (matchEndMs - matchStartMs) / 1000;

  const criticalWindowSet = new Set<number>(); // which tick-seconds are in a critical window
  for (const d of friendlyDeaths) {
    // [T-10, T] window before death
    for (let t = Math.max(0, Math.ceil(d.atSeconds - 10)); t <= Math.floor(d.atSeconds); t++) {
      criticalWindowSet.add(t);
    }
  }
  for (const d of enemyDeaths) {
    for (let t = Math.max(0, Math.ceil(d.atSeconds - 10)); t <= Math.floor(d.atSeconds); t++) {
      criticalWindowSet.add(t);
    }
  }
  for (const pw of pressureWindows) {
    if (pw.totalDamage >= DMG_SPIKE_THRESHOLD) {
      // ±5s centred on the spike start — clamp both edges
      const from = Math.max(0, Math.ceil(pw.fromSeconds - 5));
      const to = Math.min(Math.floor(matchDurationS), Math.floor(pw.fromSeconds + 5));
      for (let t = from; t <= to; t++) criticalWindowSet.add(t);
    }
  }
  for (const summary of ccTrinketSummaries) {
    for (const cc of summary.ccInstances) {
      // [cc.atSeconds, cc.atSeconds + 10] look-ahead — clamp right edge
      const from = Math.max(0, Math.ceil(cc.atSeconds));
      const to = Math.min(Math.floor(matchDurationS), Math.floor(cc.atSeconds + 10));
      for (let t = from; t <= to; t++) criticalWindowSet.add(t);
    }
  }

  const tickSet = new Set<number>();
  for (let t = 0; t <= Math.ceil(matchDurationS); t++) {
    if (criticalWindowSet.has(t) || t % 3 === 0) {
      tickSet.add(t);
    }
  }

  // Emit HP ticks — use a narrower sample window inside critical windows so adjacent
  // 1-second ticks cannot both claim the same underlying reading (which would give a
  // misleadingly flat HP line during a fast drop).
  const HP_SAMPLE_WINDOW_CRITICAL_MS = 1_500; // ±1.5s for 1s dense ticks
  const HP_SAMPLE_WINDOW_BASELINE_MS = 3_000; // ±3s for 3s baseline ticks

  const hpUnits: Array<{ unit: ICombatUnit; label: (name: string) => string }> = [
    ...friends.map((u) => ({ unit: u, label: (name: string) => pid(name) })),
    ...(enemies ?? []).map((u) => ({ unit: u, label: (name: string) => enemyPid(name) })),
  ];

  for (const t of [...tickSet].sort((a, b) => a - b)) {
    const tsMs = matchStartMs + t * 1000;
    const sampleWindowMs = criticalWindowSet.has(t) ? HP_SAMPLE_WINDOW_CRITICAL_MS : HP_SAMPLE_WINDOW_BASELINE_MS;
    const parts = hpUnits
      .map(({ unit, label }) => {
        const pct = getUnitHpAtTimestamp(unit, tsMs, sampleWindowMs);
        return pct !== null ? `${label(unit.name)}:${pct}%` : null;
      })
      .filter((s): s is string => s !== null);
    if (parts.length > 0) {
      addEntry(t, `${fmtTime(t)}  [HP]   ${parts.join(' / ')}`);
    }
  }

  // ── Sort and format ───────────────────────────────────────────────────────

  entries.sort((a, b) => a.timeSeconds - b.timeSeconds);

  const outputLines: string[] = ['MATCH TIMELINE', ''];
  for (const entry of entries) {
    outputLines.push(...entry.lines);
  }

  return outputLines.join('\n');
}
