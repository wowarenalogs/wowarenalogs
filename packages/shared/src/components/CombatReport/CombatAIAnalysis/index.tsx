import { CombatUnitReaction, CombatUnitType, ICombatUnit } from '@wowarenalogs/parser';
import { useEffect, useState } from 'react';

import {
  analyzePlayerCCAndTrinket,
  formatCCTrinketForContext,
  IPlayerCCTrinketSummary,
} from '../../../utils/ccTrinketAnalysis';
import {
  annotateDefensiveTimings,
  computePressureWindows,
  detectOverlappedDefensives,
  detectPanicDefensives,
  extractMajorCooldowns,
  fmtTime,
  formatOverlappedDefensivesForContext,
  formatPanicDefensivesForContext,
  IEnemyCDTimelineForTiming,
  IMajorCooldownInfo,
  IOverlappedDefensive,
  IPanicDefensive,
  isHealerSpec,
  specToString,
} from '../../../utils/cooldowns';
import { formatDampeningForContext } from '../../../utils/dampening';
import { canOffensivePurge, formatDispelContextForAI, reconstructDispelSummary } from '../../../utils/dispelAnalysis';
import { analyzeOutgoingCCChains, formatOutgoingCCChainsForContext } from '../../../utils/drAnalysis';
import { formatEnemyCDTimelineForContext, IEnemyCDTimeline, reconstructEnemyCDTimeline } from '../../../utils/enemyCDs';
import { analyzeHealerExposureAtBurst, formatHealerExposureForContext } from '../../../utils/healerExposureAnalysis';
import { detectHealingGaps, formatHealingGapsForContext, IHealingGap } from '../../../utils/healingGaps';
import {
  analyzeKillWindowTargetSelection,
  formatKillWindowTargetSelectionForContext,
} from '../../../utils/killWindowTargetSelection';
import { computeMatchArchetype, formatMatchArchetypeForContext } from '../../../utils/matchArchetype';
import { computeOffensiveWindows, formatOffensiveWindowsForContext } from '../../../utils/offensiveWindows';
import { useCombatReportContext } from '../CombatReportContext';

// ── Critical moment identification helpers ─────────────────────────────────

type MomentRole = 'Constraint' | 'Kill' | 'Trade' | 'Setup';

interface CriticalMoment {
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

function getEnemyStateAtTime(
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

function getOwnerCDsAvailable(timeSeconds: number, cooldowns: IMajorCooldownInfo[]): string {
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
function buildDeathRootCauseTrace(
  deathTimeSeconds: number,
  ownerCooldowns: IMajorCooldownInfo[],
  dyingPlayerCC: IPlayerCCTrinketSummary | undefined,
): string[] {
  const traces: string[] = [];

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

function findContributingDeath(
  momentTimeSeconds: number,
  friendlyDeaths: Array<{ spec: string; name: string; atSeconds: number }>,
): { spec: string; atSeconds: number } | undefined {
  return friendlyDeaths.find(
    (d) => d.atSeconds > momentTimeSeconds && d.atSeconds <= momentTimeSeconds + DEATH_LOOKFORWARD_SECONDS,
  );
}

function buildKillMomentFields(
  deathTimeSeconds: number,
  cooldowns: IMajorCooldownInfo[],
  dyingPlayerCC: IPlayerCCTrinketSummary | undefined,
  constrainedTradePreceded: boolean,
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
    const lastCast = cd.casts.filter((c) => c.timeSeconds <= deathTimeSeconds).slice(-1)[0];
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
      const lastCast = cd.casts.filter((c) => c.timeSeconds <= deathTimeSeconds).slice(-1)[0];
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
      const lastCast = cd.casts.filter((c) => c.timeSeconds <= deathTimeSeconds).slice(-1)[0];
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
    finalAssessment = {
      macroOutcome: 'All major defensive CDs committed in opening trade with no recovery window before this death',
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

function identifyCriticalMoments(
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
): { moments: CriticalMoment[]; constrainedTrade: boolean } {
  const moments: CriticalMoment[] = [];

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
        moments.push({
          timeSeconds: firstBurst.fromSeconds,
          impactScore: 90,
          impactLabel: 'Critical',
          roleLabel: 'Constraint',
          title: 'Opening burst forced full defensive trade',
          enemyState,
          friendlyState: `${cdNames} committed to survive the burst`,
          whatHappened: `${cdNames} committed at ~${fmtTime(firstBurst.fromSeconds + 2)} to survive burst (${Math.round(peakDamagePressure5s / 1000)}k peak). Trade was likely correct given burst strength.`,
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
          uncertainty: 'Cannot confirm HP% during burst or whether a partial CD hold was viable.',
        });
      }
    }
  }

  // 1. Friendly deaths — highest impact
  for (const death of friendlyDeaths) {
    const enemyState = getEnemyStateAtTime(death.atSeconds, enemyCDTimeline, peakDamagePressure5s);
    const cdState = getOwnerCDsAvailable(death.atSeconds, cooldowns);
    const nearbyGap = healingGaps.find((g) => g.fromSeconds <= death.atSeconds && g.toSeconds >= death.atSeconds - 10);
    const whatHappened = nearbyGap
      ? `${death.spec} died at ${fmtTime(death.atSeconds)}. A ${nearbyGap.durationSeconds.toFixed(1)}s healing gap (${nearbyGap.freeCastSeconds.toFixed(1)}s free-cast) was active from ${fmtTime(nearbyGap.fromSeconds)} — healer was not CC'd during this time.`
      : `${death.spec} died at ${fmtTime(death.atSeconds)}.`;
    const dyingPlayerCC = ccTrinketSummaries.find((s) => s.playerName === death.name);
    const rootCauseTrace = buildDeathRootCauseTrace(death.atSeconds, cooldowns, dyingPlayerCC);
    const { mechanicalAvailability, interpretation, tieredOptions, finalAssessment } = buildKillMomentFields(
      death.atSeconds,
      cooldowns,
      dyingPlayerCC,
      constrainedTradePreceded,
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
        'Log cannot confirm healer position, line-of-sight, or exact HP% at time of death. Cause of death may involve prior damage not reflected in the nearest pressure window.',
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
    moments.push({
      timeSeconds: panic.timeSeconds,
      impactScore: 60,
      impactLabel: 'High',
      roleLabel: panicContributingDeath ? 'Setup' : 'Trade',
      title: `Panic defensive — ${panic.spellName} used with no enemy burst detected`,
      enemyState,
      friendlyState: cdState,
      whatHappened: `${panic.casterSpec} (${panic.casterName}) cast ${panic.spellName} on ${panic.targetSpec} (${panic.targetName}) at ${fmtTime(panic.timeSeconds)}, but no significant enemy pressure was detected in the surrounding 7-second window.`,
      mechanicalAvailability: [],
      interpretation: [],
      availableOptions: `Holding ${panic.spellName} for a confirmed burst window would provide stronger coverage at the cost of a potentially risky undefended interval.`,
      uncertainty:
        'Log may miss absorbed damage that preceded the cast. Enemy intent and exact HP% cannot be confirmed from combat log events alone.',
      contributingDeathSpec: panicContributingDeath?.spec,
      contributingDeathAtSeconds: panicContributingDeath?.atSeconds,
    });
  }

  // 4. Overlapped defensives
  for (const overlap of overlappedDefensives) {
    const enemyState = getEnemyStateAtTime(overlap.timeSeconds, enemyCDTimeline);
    const overlapContributingDeath = findContributingDeath(overlap.timeSeconds, friendlyDeaths);
    moments.push({
      timeSeconds: overlap.timeSeconds,
      impactScore: 50,
      impactLabel: 'Moderate',
      roleLabel: overlapContributingDeath ? 'Setup' : 'Trade',
      title: `Defensive overlap — ${overlap.firstSpellName} + ${overlap.secondSpellName} simultaneously on ${overlap.targetName}`,
      enemyState,
      friendlyState: `${overlap.firstCasterSpec} used ${overlap.firstSpellName} at ${fmtTime(overlap.timeSeconds)}; ${overlap.secondCasterSpec} used ${overlap.secondSpellName} at ${fmtTime(overlap.secondCastTimeSeconds)} — simultaneous for ${overlap.simultaneousSeconds.toFixed(1)}s.`,
      whatHappened: `Two major defensives were stacked on ${overlap.targetName} for ${overlap.simultaneousSeconds.toFixed(1)}s of overlapping coverage, wasting effective duration of one CD.`,
      mechanicalAvailability: [],
      interpretation: [],
      availableOptions: `Staggering the CDs would extend total coverage by ~${Math.round(overlap.simultaneousSeconds)}s. Optimal: ${overlap.secondCasterSpec} waits for ${overlap.firstSpellName} to expire before pressing ${overlap.secondSpellName}.`,
      uncertainty:
        'Cannot determine if simultaneous stacking was required to survive a spike — HP values during this window are not fully tracked in the log.',
      contributingDeathSpec: overlapContributingDeath?.spec,
      contributingDeathAtSeconds: overlapContributingDeath?.atSeconds,
    });
  }

  return {
    moments: moments.sort((a, b) => b.impactScore - a.impactScore).slice(0, 3),
    constrainedTrade: constrainedTradePreceded,
  };
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds a brief event-driven Match Flow narrative from burst windows and CD trades.
 * Segments are defined by burst windows (not time slices) so the LLM sees
 * Opening Burst → Post-Trade Window → Final Burst/Phase in causal order.
 */
function buildMatchFlow(
  enemyCDTimeline: IEnemyCDTimeline,
  ownerCooldowns: IMajorCooldownInfo[],
  allTeamCooldowns: IMajorCooldownInfo[],
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
  const tradedDefs: string[] = [];
  for (const cd of allTeamCooldowns) {
    if (cd.tag !== 'Defensive') continue;
    const traded = cd.casts.find(
      (c) => c.timeSeconds >= firstBurst.fromSeconds - 5 && c.timeSeconds <= firstBurst.toSeconds + 5,
    );
    if (traded) tradedDefs.push(cd.spellName);
  }
  if (tradedDefs.length > 0) {
    lines.push(`    - Team responded: ${tradedDefs.join(' + ')} committed`);
  } else {
    lines.push(`    - No major defensive CDs traded into this burst`);
  }

  // Check if match duration is shorter than the shortest traded owner defensive CD's cooldown
  const shortestTradedCooldown = ownerCooldowns
    .filter((cd) => cd.tag === 'Defensive' && tradedDefs.includes(cd.spellName))
    .reduce<number | null>((min, cd) => (min === null ? cd.cooldownSeconds : Math.min(min, cd.cooldownSeconds)), null);
  if (shortestTradedCooldown !== null && durationSeconds < shortestTradedCooldown) {
    lines.push(
      `    - Match duration (${fmtTime(durationSeconds)}) did not allow any major cooldown recovery after this trade`,
    );
    lines.push(`    - This match contained only one full cooldown cycle`);
  }
  lines.push('');

  // Segment 2: Post-trade window (between first and second burst, or first burst and death)
  const secondBurst = bursts[1];
  const midEnd = secondBurst ? secondBurst.fromSeconds : firstDeath ? firstDeath.atSeconds - 5 : durationSeconds - 5;
  if (midEnd - firstBurst.toSeconds > 5) {
    lines.push(`  Post-Trade Window (${fmtTime(firstBurst.toSeconds)}–${fmtTime(midEnd)}):`);
    const ownerDefsAvailableInWindow = ownerCooldowns.filter((cd) => {
      if (cd.tag !== 'Defensive') return false;
      const lastCast = cd.casts.filter((c) => c.timeSeconds <= firstBurst.toSeconds).slice(-1)[0];
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
      const lastCast = cd.casts.filter((c) => c.timeSeconds <= finalEndTime).slice(-1)[0];
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

export function buildMatchContext(
  combat: NonNullable<ReturnType<typeof useCombatReportContext>['combat']>,
  friends: ReturnType<typeof useCombatReportContext>['friends'],
  enemies: ReturnType<typeof useCombatReportContext>['enemies'],
): string {
  const durationSeconds = (combat.endTime - combat.startTime) / 1000;

  // Find the log owner (the player who recorded the log)
  const owner = friends.find((p) => p.id === combat.playerId) ?? friends[0];
  if (!owner) return '';

  const ownerSpec = specToString(owner.spec);
  const healer = isHealerSpec(owner.spec);

  const myTeam = friends.map((p) => specToString(p.spec)).join(', ');
  const enemyTeam = enemies.map((p) => specToString(p.spec)).join(', ');

  // Match result
  const combatAny = combat as unknown as Record<string, unknown>;
  const playerWon =
    typeof combatAny['winningTeamId'] === 'string' ? combatAny['winningTeamId'] === combat.playerTeamId : null;
  const resultStr = playerWon === true ? 'Win' : playerWon === false ? 'Loss' : 'Unknown';

  // Deaths
  const friendlyDeaths = friends
    .filter((p) => p.deathRecords.length > 0)
    .flatMap((p) =>
      p.deathRecords.map((d) => ({
        spec: specToString(p.spec),
        name: p.name,
        atSeconds: (d.timestamp - combat.startTime) / 1000,
      })),
    )
    .sort((a, b) => a.atSeconds - b.atSeconds);

  const enemyDeaths = enemies
    .filter((p) => p.deathRecords.length > 0)
    .flatMap((p) =>
      p.deathRecords.map((d) => ({
        spec: specToString(p.spec),
        name: p.name,
        atSeconds: (d.timestamp - combat.startTime) / 1000,
      })),
    )
    .sort((a, b) => a.atSeconds - b.atSeconds);

  // Compute all feature data upfront
  const cooldowns = extractMajorCooldowns(owner, combat);
  const teammateCooldowns = friends
    .filter((p) => p.id !== owner.id)
    .map((p) => ({ player: p, cds: extractMajorCooldowns(p, combat) }));
  const enemyCDTimeline = reconstructEnemyCDTimeline(enemies, combat, owner, friends);
  // Annotate defensive timing labels now that we have the enemy CD timeline
  annotateDefensiveTimings(cooldowns, owner, combat, enemyCDTimeline as IEnemyCDTimelineForTiming);
  teammateCooldowns.forEach(({ player, cds }) =>
    annotateDefensiveTimings(cds, player, combat, enemyCDTimeline as IEnemyCDTimelineForTiming),
  );
  const pressureWindows = computePressureWindows(friends, combat);
  const overlappedDefensives = detectOverlappedDefensives(friends, combat);
  const panicDefensives = detectPanicDefensives(friends, enemies, combat);
  const healingGaps = healer ? detectHealingGaps(owner, friends, enemies, combat) : [];
  const offensiveWindows = computeOffensiveWindows(enemies, friends, combat);
  const killWindowTargetEvals = analyzeKillWindowTargetSelection(offensiveWindows, enemies as ICombatUnit[], combat);
  const dispelSummary = reconstructDispelSummary(friends, enemies, combat);
  const ccTrinketSummaries = friends.map((p) => analyzePlayerCCAndTrinket(p, enemies, combat));
  const outgoingCCChains = analyzeOutgoingCCChains(friends as ICombatUnit[], enemies as ICombatUnit[], combat);
  const healerUnit = friends.find((p) => isHealerSpec(p.spec)) as ICombatUnit | undefined;
  const healerCCSummary = healerUnit ? ccTrinketSummaries.find((s) => s.playerName === healerUnit.name) : undefined;
  const healerExposures =
    healerUnit && healerCCSummary
      ? analyzeHealerExposureAtBurst(
          enemyCDTimeline.alignedBurstWindows,
          enemies as ICombatUnit[],
          healerUnit,
          healerCCSummary,
          ccTrinketSummaries,
          combat.startInfo.zoneId,
          combat.startTime,
        )
      : [];

  const matchArchetype = computeMatchArchetype(
    friends as ICombatUnit[],
    enemies as ICombatUnit[],
    combat,
    ccTrinketSummaries,
    enemyCDTimeline.alignedBurstWindows,
    healerExposures,
  );

  // Identify top critical moments; constrainedTrade flag reused for CC section framing
  const { moments: criticalMoments, constrainedTrade: hasConstrainedTrade } = identifyCriticalMoments(
    healer,
    cooldowns,
    enemyCDTimeline,
    friendlyDeaths,
    healingGaps,
    panicDefensives,
    overlappedDefensives,
    ccTrinketSummaries,
    matchArchetype.peakDamagePressure5s,
    durationSeconds,
  );

  // Purge responsibility attribution
  const ownerCanPurge = canOffensivePurge(owner as ICombatUnit);
  const teamPurgers = friends
    .filter((p) => p.id !== owner.id && canOffensivePurge(p as ICombatUnit))
    .map((p) => specToString(p.spec));

  const lines: string[] = [];

  // ── MATCH SUMMARY ──────────────────────────────────────────────────────────
  lines.push('ARENA MATCH — DECISION ANALYSIS REQUEST');
  lines.push('');
  lines.push('MATCH SUMMARY');
  lines.push(
    `  Spec: ${ownerSpec}${healer ? ' (Healer)' : ''}  |  Bracket: ${combat.startInfo.bracket}  |  Result: ${resultStr}  |  Duration: ${fmtTime(durationSeconds)}`,
  );
  lines.push(`  My team: ${myTeam}`);
  lines.push(`  Enemy team: ${enemyTeam}`);
  const deathParts = [
    ...friendlyDeaths.map((d) => `${d.spec} (my team, ${fmtTime(d.atSeconds)})`),
    ...enemyDeaths.map((d) => `${d.spec} (enemy, ${fmtTime(d.atSeconds)})`),
  ];
  lines.push(`  Deaths: ${deathParts.length > 0 ? deathParts.join(', ') : 'None'}`);
  lines.push('');
  formatMatchArchetypeForContext(matchArchetype).forEach((l) => lines.push(l));

  // ── MATCH FLOW ─────────────────────────────────────────────────────────────
  lines.push('');
  const allTeamCooldownsFlat = [cooldowns, ...teammateCooldowns.map(({ cds }) => cds)].flat();
  buildMatchFlow(enemyCDTimeline, cooldowns, allTeamCooldownsFlat, friendlyDeaths, durationSeconds).forEach((l) =>
    lines.push(l),
  );

  // ── CRITICAL MOMENTS ───────────────────────────────────────────────────────
  lines.push('CRITICAL MOMENTS (interpret as a sequence where earlier events constrain later options):');
  lines.push('');

  if (criticalMoments.length === 0) {
    lines.push('  No critical moments identified from available data.');
  } else {
    criticalMoments.forEach((m, i) => {
      const impactStr = m.roleLabel === 'Constraint' ? 'Context-setting — not a mistake' : m.impactLabel;
      lines.push(`--- MOMENT ${i + 1} (${m.roleLabel}) (impact: ${impactStr}) ---`);
      lines.push(`${fmtTime(m.timeSeconds)} — ${m.title}`);
      lines.push(`  Enemy state: ${m.enemyState}`);

      if (m.roleLabel === 'Constraint') {
        lines.push(
          `  NOTE: This moment is not a mistake. It defines the resource constraints for the rest of the match.`,
        );
        lines.push(`  What happened:`);
        lines.push(`  What happened: ${m.whatHappened}`);
        if (m.implication && m.implication.length > 0) {
          lines.push(`  Implication:`);
          m.implication.forEach((l) => lines.push(`    - ${l}`));
        }
      } else {
        if (m.roleLabel !== 'Kill') {
          lines.push(`  Friendly state: ${m.friendlyState}`);
          if (!m.isDeath && m.contributingDeathSpec !== undefined && m.contributingDeathAtSeconds !== undefined) {
            const deltaSeconds = Math.round(m.contributingDeathAtSeconds - m.timeSeconds);
            lines.push(
              `  ⚠ Contributing factor: ${m.contributingDeathSpec} died ${deltaSeconds}s later at ${fmtTime(m.contributingDeathAtSeconds)}`,
            );
          }
        }
        lines.push(`  What happened: ${m.whatHappened}`);
        if (m.rootCauseTrace && m.rootCauseTrace.length > 0) {
          lines.push(`  Root cause trace (why the death happened — trace back from here):`);
          m.rootCauseTrace.forEach((t) => lines.push(`    - ${t}`));
        }
      }

      // Kill moments: use three-tier options; others: flat list or legacy availableOptions
      if (m.roleLabel === 'Kill' && m.tieredOptions) {
        const { realistic, limited, unavailable } = m.tieredOptions;
        if (realistic.length > 0 || limited.length > 0 || unavailable.length > 0) {
          lines.push(`  Possible responses (given constraints from earlier moments):`);
          if (realistic.length > 0) {
            lines.push(`    Realistic options:`);
            realistic.forEach((o) => lines.push(`      - ${o}`));
          }
          if (limited.length > 0) {
            lines.push(`    Limited options:`);
            limited.forEach((o) => lines.push(`      - ${o}`));
          }
          if (unavailable.length > 0) {
            lines.push(`    Unavailable:`);
            unavailable.forEach((o) => lines.push(`      - ${o}`));
          }
        }
      } else if (m.mechanicalAvailability.length > 0 || m.interpretation.length > 0) {
        lines.push(`  Possible responses at this moment (given constraints from earlier moments):`);
        if (m.mechanicalAvailability.length > 0) {
          lines.push(`    Mechanical availability:`);
          m.mechanicalAvailability.forEach((a) => lines.push(`      - ${a}`));
        }
        if (m.interpretation.length > 0) {
          lines.push(`    Interpretation:`);
          m.interpretation.forEach((interp) => lines.push(`      - ${interp}`));
        }
      } else if (m.roleLabel !== 'Constraint' && m.roleLabel !== 'Kill') {
        lines.push(`  Available options: ${m.availableOptions}`);
      }

      if (m.finalAssessment) {
        lines.push(`  Structural context:`);
        lines.push(`    - ${m.finalAssessment.macroOutcome}`);
        if (m.finalAssessment.microMistakes.length > 0) {
          lines.push(`    Micro-level opportunities:`);
          m.finalAssessment.microMistakes.forEach((mm) => lines.push(`      - ${mm}`));
        }
      }

      lines.push(`  Uncertainty: ${m.uncertainty}`);
      lines.push('');
    });
  }

  // ── SUPPORTING DATA ────────────────────────────────────────────────────────
  lines.push('SUPPORTING DATA (for reference when evaluating moments above):');

  // Purge responsibility — explicit attribution so Claude doesn't blame wrong player
  lines.push('');
  lines.push('PURGE RESPONSIBILITY:');
  if (ownerCanPurge) {
    lines.push(`  Log owner (${ownerSpec}): CAN offensive purge`);
  } else {
    lines.push(`  Log owner (${ownerSpec}): CANNOT offensive purge — do not attribute missed purges to the log owner`);
  }
  lines.push(
    teamPurgers.length > 0
      ? `  Team offensive purgers: ${teamPurgers.join(', ')}`
      : '  Team offensive purgers: None (no teammate has an offensive purge ability)',
  );

  // Owner cooldowns
  lines.push('');
  lines.push(`COOLDOWN USAGE — LOG OWNER (${ownerSpec}) — major CDs ≥30s:`);
  if (cooldowns.length === 0) {
    lines.push('  No major cooldown data found for this spec.');
  } else {
    cooldowns.forEach((cd) => {
      lines.push('');
      lines.push(`  ${cd.spellName} [${cd.tag}, ${cd.cooldownSeconds}s CD]:`);
      if (cd.neverUsed) {
        lines.push(`    STATUS: NEVER USED`);
      } else {
        cd.casts.forEach((c) => {
          const timing =
            c.timingLabel && c.timingLabel !== 'Unknown'
              ? ` [${c.timingLabel.toUpperCase()}${c.timingContext ? ` — ${c.timingContext}` : ''}]`
              : '';
          lines.push(`    Cast at: ${fmtTime(c.timeSeconds)}${timing}`);
        });
      }
      if (cd.availableWindows.length > 0) {
        lines.push(`    Idle windows:`);
        cd.availableWindows.forEach((w) => {
          const overlapping = pressureWindows.filter((p) => p.fromSeconds < w.toSeconds && p.toSeconds > w.fromSeconds);
          const pressureNote =
            overlapping.length > 0
              ? ` — pressure during idle: ${overlapping.map((p) => `${fmtTime(p.fromSeconds)} (${(p.totalDamage / 1_000_000).toFixed(2)}M on ${p.targetSpec})`).join(', ')}`
              : '';
          lines.push(
            `      ${fmtTime(w.fromSeconds)}–${fmtTime(w.toSeconds)} (${Math.round(w.durationSeconds)}s)${pressureNote}`,
          );
        });
      }
    });
  }

  // Teammate cooldowns
  if (teammateCooldowns.length > 0) {
    lines.push('');
    lines.push('TEAMMATE COOLDOWNS:');
    for (const { player, cds } of teammateCooldowns) {
      const spec = specToString(player.spec);
      if (cds.length === 0) {
        lines.push(`  ${spec} (${player.name}): No major CD data.`);
        continue;
      }
      lines.push(`  ${spec} (${player.name}):`);
      for (const cd of cds) {
        if (cd.neverUsed) {
          lines.push(`    ${cd.spellName} [${cd.cooldownSeconds}s CD]: NEVER USED`);
        } else {
          const castStr = cd.casts.map((c) => fmtTime(c.timeSeconds)).join(', ');
          const idleStr =
            cd.availableWindows.length > 0
              ? ` | idle: ${cd.availableWindows.map((w) => `${fmtTime(w.fromSeconds)}–${fmtTime(w.toSeconds)}`).join(', ')}`
              : '';
          lines.push(`    ${cd.spellName} [${cd.cooldownSeconds}s CD]: cast at ${castStr}${idleStr}`);
        }
      }
    }
  }

  lines.push('');
  formatEnemyCDTimelineForContext(enemyCDTimeline, durationSeconds).forEach((l) => lines.push(l));

  lines.push('');
  formatOverlappedDefensivesForContext(overlappedDefensives).forEach((l) => lines.push(l));

  lines.push('');
  formatPanicDefensivesForContext(panicDefensives).forEach((l) => lines.push(l));

  lines.push('');
  formatDispelContextForAI(dispelSummary).forEach((l) => lines.push(l));

  if (healer) {
    lines.push('');
    formatHealingGapsForContext(healingGaps).forEach((l) => lines.push(l));
  }

  lines.push('');
  formatOffensiveWindowsForContext(offensiveWindows).forEach((l) => lines.push(l));

  const targetSelectionLines = formatKillWindowTargetSelectionForContext(killWindowTargetEvals);
  if (targetSelectionLines.length > 0) {
    lines.push('');
    targetSelectionLines.forEach((l) => lines.push(l));
  }

  lines.push('');
  formatCCTrinketForContext(ccTrinketSummaries).forEach((l) => lines.push(l));

  const healerExposureLines = formatHealerExposureForContext(healerExposures);
  if (healerExposureLines.length > 0) {
    lines.push('');
    healerExposureLines.forEach((l) => lines.push(l));
  }

  const outgoingCCLines = formatOutgoingCCChainsForContext(outgoingCCChains);
  if (outgoingCCLines.length > 0) {
    lines.push('');
    outgoingCCLines.forEach((l) => lines.push(l));
    if (hasConstrainedTrade && friendlyDeaths.length > 0) {
      lines.push(
        `  Note: CC casts in the final phase of this match had limited follow-up potential — major defensive resources were exhausted.`,
      );
    }
  }

  lines.push('');
  formatDampeningForContext(
    combat.startInfo.bracket,
    [...friends, ...enemies],
    combat.startTime,
    combat.endTime,
  ).forEach((l) => lines.push(l));

  return lines.join('\n');
}

// Minimal markdown renderer (bold, bullets, headers)
function MarkdownBlock({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <h3 key={i} className="text-base font-bold mt-4 mb-1">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="flex gap-2 my-0.5">
              <span className="text-primary mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(line.slice(2)) }} />
            </div>
          );
        }
        if (/^\d+\. /.test(line)) {
          const num = line.match(/^(\d+)\. /)?.[1];
          return (
            <div key={i} className="flex gap-2 my-0.5">
              <span className="text-primary font-bold min-w-[1.2rem]">{num}.</span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(line.replace(/^\d+\. /, '')) }} />
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return <p key={i} className="my-0.5" dangerouslySetInnerHTML={{ __html: renderInline(line) }} />;
      })}
    </div>
  );
}

function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="text-xs bg-base-300 px-1 rounded">$1</code>');
}

// Session-level cache: persists across tab switches and match switches without a server round-trip.
const analysisCache = new Map<string, string>();
// In-flight requests: allows re-attaching to an ongoing fetch after a tab switch.
const inFlightRequests = new Map<string, Promise<string>>();

export function CombatAIAnalysis() {
  const { combat, friends, enemies } = useCombatReportContext();
  const [analysis, setAnalysis] = useState<string | null>(() => analysisCache.get(combat?.id ?? '') ?? null);
  const [loading, setLoading] = useState(() => inFlightRequests.has(combat?.id ?? ''));
  const [error, setError] = useState<string | null>(null);

  // When the combat changes (or on mount): sync cached result or re-attach to an in-flight request.
  useEffect(() => {
    if (!combat) return;

    const cached = analysisCache.get(combat.id);
    if (cached) {
      setAnalysis(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const inFlight = inFlightRequests.get(combat.id);
    if (inFlight) {
      setAnalysis(null);
      setLoading(true);
      setError(null);
      inFlight
        .then((result) => {
          setAnalysis(result);
          setLoading(false);
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : 'Analysis failed');
          setLoading(false);
        });
      return;
    }

    setAnalysis(null);
    setLoading(false);
    setError(null);
  }, [combat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!combat) return null;

  const allPlayers = [...friends, ...enemies];
  const hasPlayers = allPlayers.some(
    (p) => p.type === CombatUnitType.Player && p.reaction === CombatUnitReaction.Friendly,
  );
  if (!hasPlayers) {
    return <div className="p-4 text-base-content opacity-60">No player data available for analysis.</div>;
  }

  const handleAnalyze = async () => {
    const combatId = combat.id;
    setLoading(true);
    setError(null);
    setAnalysis(null);

    const fetchPromise: Promise<string> = (async () => {
      const matchContext = buildMatchContext(combat, friends, enemies);
      const apiKey = (await window.wowarenalogs?.settings?.getAnthropicApiKey?.()) ?? undefined;
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchContext, apiKey }),
      });
      const data = (await res.json()) as { analysis?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Analysis failed');
      const result = data.analysis ?? '';
      analysisCache.set(combatId, result);
      return result;
    })();

    inFlightRequests.set(combatId, fetchPromise);
    fetchPromise.finally(() => inFlightRequests.delete(combatId));

    try {
      const result = await fetchPromise;
      // Ignore result if the user switched to a different match while this was in flight
      if (combat.id !== combatId) return;
      setAnalysis(result);
    } catch (e) {
      if (combat.id !== combatId) return;
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      if (combat.id === combatId) setLoading(false);
    }
  };

  const owner = friends.find((p) => p.id === combat.playerId) ?? friends[0];
  const ownerSpec = owner ? specToString(owner.spec) : 'Unknown';

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-bold">AI Cooldown Analysis</h3>
        <p className="text-sm opacity-60">
          Analyzing <span className="font-semibold">{ownerSpec}</span> — reviews your major cooldown usage and gives
          specific recommendations.
        </p>
      </div>

      {!analysis && !loading && (
        <button className="btn btn-primary w-fit" onClick={handleAnalyze} disabled={loading}>
          Analyse this match
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-3">
          <span className="loading loading-spinner loading-sm text-primary" />
          <span className="text-sm opacity-60">Analysing your cooldown usage…</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="btn btn-sm btn-ghost ml-auto" onClick={handleAnalyze}>
            Retry
          </button>
        </div>
      )}

      {analysis && (
        <div className="flex flex-col gap-3">
          <div className="card bg-base-200 p-4">
            <MarkdownBlock text={analysis} />
          </div>
          <button className="btn btn-ghost btn-sm w-fit" onClick={handleAnalyze}>
            Re-analyse
          </button>
        </div>
      )}
    </div>
  );
}
