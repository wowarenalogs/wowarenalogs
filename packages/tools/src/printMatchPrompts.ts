/* eslint-disable no-console */
/**
 * printMatchPrompts.ts
 *
 * Downloads matches from the cloud and prints the complete AI prompt string
 * that would be sent to Claude for each match — same pipeline as buildMatchContext()
 * in CombatAIAnalysis/index.tsx, without any React dependencies.
 *
 * Usage:
 *   npm run -w @wowarenalogs/tools start:printMatchPrompts
 *   npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 10
 *   npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 5 --bracket 3v3
 *   npm run -w @wowarenalogs/tools start:printMatchPrompts -- --local   (reads ~/Downloads/wow logs/)
 */

import { CombatUnitReaction, CombatUnitType, IArenaMatch, ICombatUnit, IShuffleRound } from '@wowarenalogs/parser';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import os from 'os';
import path from 'path';

import {
  analyzePlayerCCAndTrinket,
  formatCCTrinketForContext,
  IPlayerCCTrinketSummary,
} from '../../shared/src/utils/ccTrinketAnalysis';
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
} from '../../shared/src/utils/cooldowns';
import { formatDampeningForContext } from '../../shared/src/utils/dampening';
import {
  canOffensivePurge,
  formatDispelContextForAI,
  reconstructDispelSummary,
} from '../../shared/src/utils/dispelAnalysis';
import { analyzeOutgoingCCChains, formatOutgoingCCChainsForContext } from '../../shared/src/utils/drAnalysis';
import {
  formatEnemyCDTimelineForContext,
  IEnemyCDTimeline,
  reconstructEnemyCDTimeline,
} from '../../shared/src/utils/enemyCDs';
import {
  analyzeHealerExposureAtBurst,
  formatHealerExposureForContext,
} from '../../shared/src/utils/healerExposureAnalysis';
import { detectHealingGaps, formatHealingGapsForContext, IHealingGap } from '../../shared/src/utils/healingGaps';
import {
  analyzeKillWindowTargetSelection,
  formatKillWindowTargetSelectionForContext,
  getHpPercentAtTime,
} from '../../shared/src/utils/killWindowTargetSelection';
import { computeMatchArchetype, formatMatchArchetypeForContext } from '../../shared/src/utils/matchArchetype';
import { computeOffensiveWindows, formatOffensiveWindowsForContext } from '../../shared/src/utils/offensiveWindows';

const API_BASE = 'https://wowarenalogs.com';

type ParsedCombat = IArenaMatch | IShuffleRound;

// ---------------------------------------------------------------------------
// Cloud download
// ---------------------------------------------------------------------------

const STUBS_QUERY = `
  query GetLatestMatches($wowVersion: String!, $bracket: String, $offset: Int!, $count: Int!) {
    latestMatches(wowVersion: $wowVersion, bracket: $bracket, offset: $offset, count: $count) {
      combats {
        ... on ArenaMatchDataStub  { id wowVersion logObjectUrl startTime endTime timezone startInfo { bracket } }
        ... on ShuffleRoundStub    { id wowVersion logObjectUrl startTime endTime timezone startInfo { bracket } }
      }
    }
  }
`;

interface MatchStub {
  id: string;
  wowVersion: string;
  logObjectUrl: string;
  startTime: number;
  startInfo?: { bracket: string };
}

async function fetchStubs(bracket: string, count: number): Promise<MatchStub[]> {
  const res = await fetch(`${API_BASE}/api/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: STUBS_QUERY, variables: { wowVersion: 'retail', bracket, offset: 0, count } }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status}: ${res.statusText}`);
  const json = (await res.json()) as { data?: { latestMatches?: { combats?: MatchStub[] } }; errors?: unknown[] };
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data?.latestMatches?.combats ?? [];
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

async function parseLogText(text: string): Promise<ParsedCombat[]> {
  const { WoWCombatLogParser } = await import('@wowarenalogs/parser');
  const lines = text.split('\n');
  const parser = new WoWCombatLogParser('retail');
  const combats: ParsedCombat[] = [];
  parser.on('arena_match_ended', (c: IArenaMatch) => combats.push(c));
  parser.on('solo_shuffle_ended', (m: { rounds: IShuffleRound[] }) => combats.push(...m.rounds));
  for (const line of lines) parser.parseLine(line);
  parser.flush();
  return combats;
}

// ---------------------------------------------------------------------------
// Critical moment helpers — inlined from CombatAIAnalysis/index.tsx
// (cannot import that file due to React dependencies)
// ---------------------------------------------------------------------------

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
  implication?: string[];
  mechanicalAvailability: string[];
  interpretation: string[];
  tieredOptions?: { realistic: string[]; limited: string[]; unavailable: string[] };
  finalAssessment?: { macroOutcome: string; microMistakes: string[] };
  availableOptions: string;
  uncertainty: string;
  isDeath?: boolean;
  contributingDeathSpec?: string;
  contributingDeathAtSeconds?: number;
  rootCauseTrace?: string[];
}

function getEnemyStateAtTime(
  timeSeconds: number,
  enemyCDTimeline: IEnemyCDTimeline,
  peakDamagePressure5s?: number,
): string {
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

function buildDeathRootCauseTrace(
  deathTimeSeconds: number,
  ownerCooldowns: IMajorCooldownInfo[],
  dyingPlayerCC: IPlayerCCTrinketSummary | undefined,
): string[] {
  const traces: string[] = [];
  for (const cd of ownerCooldowns) {
    if (cd.neverUsed) {
      traces.push(`${cd.spellName} [${cd.tag}]: NEVER USED — was available throughout the match`);
      continue;
    }
    const castsBeforeDeath = cd.casts.filter((c) => c.timeSeconds <= deathTimeSeconds);
    if (castsBeforeDeath.length === 0) {
      traces.push(`${cd.spellName} [${cd.tag}]: not yet used — was available at death time`);
      continue;
    }
    const lastCast = castsBeforeDeath[castsBeforeDeath.length - 1];
    const readyAt = lastCast.timeSeconds + cd.cooldownSeconds;
    if (readyAt > deathTimeSeconds) {
      const timeAgo = Math.round(deathTimeSeconds - lastCast.timeSeconds);
      const timing =
        lastCast.timingLabel && lastCast.timingLabel !== 'Unknown'
          ? ` [last use: ${lastCast.timingLabel.toUpperCase()}${lastCast.timingContext ? ` — ${lastCast.timingContext}` : ''}]`
          : '';
      traces.push(
        `${cd.spellName} [${cd.tag}]: ON COOLDOWN at death — last used ${fmtTime(lastCast.timeSeconds)} (${timeAgo}s before death)${timing}`,
      );
    } else {
      traces.push(`${cd.spellName} [${cd.tag}]: available at death time — not pressed`);
    }
  }
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
  const CC_LOOKBACK = 15;

  for (const cd of cooldowns) {
    if (cd.tag !== 'Defensive') continue;
    const lastCast = cd.casts.filter((c) => c.timeSeconds <= deathTimeSeconds).slice(-1)[0];
    if (!lastCast) {
      mechAvail.push(
        cd.neverUsed ? `${cd.spellName}: never used — available` : `${cd.spellName}: not yet used — available`,
      );
    } else {
      const readyAt = lastCast.timeSeconds + cd.cooldownSeconds;
      mechAvail.push(
        readyAt > deathTimeSeconds
          ? `${cd.spellName}: on CD (last used ${fmtTime(lastCast.timeSeconds)})`
          : `${cd.spellName}: available since ${fmtTime(readyAt)}`,
      );
    }
  }

  const nearDeathTrinketAvailable = dyingPlayerCC?.ccInstances.find(
    (cc) =>
      cc.atSeconds <= deathTimeSeconds &&
      cc.atSeconds >= deathTimeSeconds - CC_LOOKBACK &&
      cc.trinketState === 'available_unused',
  );
  mechAvail.push(
    nearDeathTrinketAvailable
      ? `Trinket available at ${fmtTime(nearDeathTrinketAvailable.atSeconds)} during ${nearDeathTrinketAvailable.spellName} — not used`
      : 'Trinket: on cooldown or already spent',
  );

  if (constrainedTradePreceded) {
    interp.push('No direct defensive response possible at death — resource exhausted by opening burst trade');
  } else {
    const spentCDs = cooldowns.filter((cd) => {
      if (cd.tag !== 'Defensive') return false;
      const lastCast = cd.casts.filter((c) => c.timeSeconds <= deathTimeSeconds).slice(-1)[0];
      if (!lastCast) return false;
      return lastCast.timeSeconds + cd.cooldownSeconds > deathTimeSeconds;
    });
    if (spentCDs.length > 0) interp.push(`Major defensives spent: ${spentCDs.map((cd) => cd.spellName).join(', ')}`);
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

  // 0. ConstrainedTrade gate
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
        dyingHpBefore !== null
          ? 'Log cannot confirm healer position or line-of-sight at time of death. Cause of death may involve prior damage not reflected in the nearest pressure window.'
          : 'Log cannot confirm healer position, line-of-sight, or exact HP% at time of death. Cause of death may involve prior damage not reflected in the nearest pressure window.',
      isDeath: true,
      rootCauseTrace,
    });
  }

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

  return {
    moments: moments.sort((a, b) => b.impactScore - a.impactScore).slice(0, 3),
    constrainedTrade: constrainedTradePreceded,
  };
}

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

  lines.push(`  Opening Burst (${fmtTime(firstBurst.fromSeconds)}–${fmtTime(firstBurst.toSeconds)}):`);
  const burstCDNames = firstBurst.activeCDs.map((c) => c.spellName).join(' + ');
  lines.push(`    - Enemy aligned burst (${firstBurst.dangerLabel} — ${burstCDNames})`);

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

  const secondBurst = bursts[1];
  const midEnd = secondBurst ? secondBurst.fromSeconds : firstDeath ? firstDeath.atSeconds - 5 : durationSeconds - 5;
  if (midEnd - firstBurst.toSeconds > 5) {
    lines.push(`  Post-Trade Window (${fmtTime(firstBurst.toSeconds)}–${fmtTime(midEnd)}):`);
    const ownerDefsAvailable = ownerCooldowns.filter((cd) => {
      if (cd.tag !== 'Defensive') return false;
      const lastCast = cd.casts.filter((c) => c.timeSeconds <= firstBurst.toSeconds).slice(-1)[0];
      if (!lastCast) return true; // never-used or not yet cast — still available
      return lastCast.timeSeconds + cd.cooldownSeconds <= midEnd;
    });
    if (ownerDefsAvailable.length === 0) {
      lines.push(`    - No major defensive CDs available on owner during this window`);
    }
    if (!secondBurst) {
      lines.push(`    - No coordinated enemy burst — both sides recovering CDs`);
    }
    lines.push('');
  }

  const finalBurst = bursts.length >= 2 ? bursts[bursts.length - 1] : undefined;
  const finalEndTime = firstDeath?.atSeconds ?? durationSeconds;

  if (finalBurst) {
    lines.push(`  Final Burst (${fmtTime(finalBurst.fromSeconds)}–${fmtTime(finalEndTime)}):`);
    const finalCDNames = finalBurst.activeCDs.map((c) => c.spellName).join(' + ');
    lines.push(`    - Enemy burst (${finalBurst.dangerLabel} — ${finalCDNames})`);
  } else {
    lines.push(`  Final Phase (${fmtTime(firstBurst.toSeconds)}–${fmtTime(finalEndTime)}):`);
  }

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
  lines.push(
    firstDeath
      ? `    - → ${firstDeath.spec} died at ${fmtTime(firstDeath.atSeconds)}`
      : `    - → No friendly deaths — match ended in a win`,
  );
  lines.push('');

  return lines;
}

// ---------------------------------------------------------------------------
// Build full prompt — mirrors buildMatchContext() in CombatAIAnalysis/index.tsx
// ---------------------------------------------------------------------------

// Cloud matches have no single "owner" — pick friendly[0] as the log owner proxy
function buildMatchPrompt(combat: ParsedCombat): string {
  const allUnits = Object.values(combat.units);
  const friends = allUnits.filter(
    (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Friendly,
  ) as ICombatUnit[];
  const enemies = allUnits.filter(
    (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Hostile,
  ) as ICombatUnit[];

  if (friends.length === 0 || enemies.length === 0) return '';
  const durationSeconds = (combat.endTime - combat.startTime) / 1000;
  if (durationSeconds < 10) return '';

  // Pick log owner: prefer non-healer DPS so we have interesting cooldown data
  const owner = friends.find((p) => !isHealerSpec(p.spec)) ?? friends.find((p) => isHealerSpec(p.spec)) ?? friends[0];

  const ownerSpec = specToString(owner.spec);
  const healer = isHealerSpec(owner.spec);
  const myTeam = friends.map((p) => specToString(p.spec)).join(', ');
  const enemyTeam = enemies.map((p) => specToString(p.spec)).join(', ');

  const combatAny = combat as unknown as Record<string, unknown>;
  const playerWon =
    typeof combatAny['winningTeamId'] === 'string' ? combatAny['winningTeamId'] === combat.playerTeamId : null;
  const resultStr = playerWon === true ? 'Win' : playerWon === false ? 'Loss' : 'Unknown';

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

  const cooldowns = extractMajorCooldowns(owner, combat);
  const teammateCooldowns = friends
    .filter((p) => p.id !== owner.id)
    .map((p) => ({ player: p, cds: extractMajorCooldowns(p, combat) }));
  const enemyCDTimeline = reconstructEnemyCDTimeline(enemies, combat, owner, friends);
  annotateDefensiveTimings(cooldowns, owner, combat, enemyCDTimeline as IEnemyCDTimelineForTiming);
  teammateCooldowns.forEach(({ player, cds }) =>
    annotateDefensiveTimings(cds, player, combat, enemyCDTimeline as IEnemyCDTimelineForTiming),
  );
  const pressureWindows = computePressureWindows(friends, combat);
  const overlappedDefensives = detectOverlappedDefensives(friends, combat);
  const panicDefensives = detectPanicDefensives(friends, enemies, combat);
  const healingGaps = healer ? detectHealingGaps(owner, friends, enemies, combat) : [];
  const offensiveWindows = computeOffensiveWindows(enemies, friends, combat);
  const killWindowTargetEvals = analyzeKillWindowTargetSelection(offensiveWindows, enemies, combat);
  const dispelSummary = reconstructDispelSummary(friends, enemies, combat);
  const ccTrinketSummaries = friends.map((p) => analyzePlayerCCAndTrinket(p, enemies, combat));
  const outgoingCCChains = analyzeOutgoingCCChains(friends, enemies, combat);
  const healerUnit = friends.find((p) => isHealerSpec(p.spec)) ?? undefined;
  const healerCCSummary = healerUnit ? ccTrinketSummaries.find((s) => s.playerName === healerUnit.name) : undefined;
  const healerExposures =
    healerUnit && healerCCSummary
      ? analyzeHealerExposureAtBurst(
          enemyCDTimeline.alignedBurstWindows,
          enemies,
          healerUnit,
          healerCCSummary,
          ccTrinketSummaries,
          combat.startInfo.zoneId,
          combat.startTime,
        )
      : [];

  const matchArchetype = computeMatchArchetype(
    friends,
    enemies,
    combat,
    ccTrinketSummaries,
    enemyCDTimeline.alignedBurstWindows,
    healerExposures,
  );

  // constrainedTrade flag reused for CC section framing
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
    friends,
    combat.startTime,
  );

  const ownerCanPurge = canOffensivePurge(owner);
  const teamPurgers = friends.filter((p) => p.id !== owner.id && canOffensivePurge(p)).map((p) => specToString(p.spec));

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

// ---------------------------------------------------------------------------
// Cloud runner
// ---------------------------------------------------------------------------

async function runCloud(count: number, bracket: string) {
  console.log(`Fetching ${count} matches (bracket: ${bracket}) from ${API_BASE}...\n`);

  const stubs = await fetchStubs(bracket, count);
  if (stubs.length === 0) {
    console.error('No matches returned from API.');
    process.exit(1);
  }
  console.log(`Got ${stubs.length} stub(s). Downloading logs...\n`);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wlogs-prompts-'));
  let matchCount = 0;

  try {
    for (const stub of stubs) {
      const date = new Date(stub.startTime).toISOString().slice(0, 10);
      process.stderr.write(`Downloading ${stub.id} (${stub.startInfo?.bracket ?? bracket}, ${date})...\n`);

      let text: string;
      try {
        const res = await fetch(stub.logObjectUrl);
        if (!res.ok) throw new Error(`GCS ${res.status}`);
        text = await res.text();
      } catch (e) {
        console.error(`  Download failed: ${e}`);
        continue;
      }

      let combats: ParsedCombat[];
      try {
        combats = await parseLogText(text);
      } catch (e) {
        console.error(`  Parse failed: ${e}`);
        continue;
      }

      for (const combat of combats) {
        const prompt = buildMatchPrompt(combat);
        if (!prompt) continue;
        matchCount++;
        const sep = '='.repeat(80);
        console.log(`\n${sep}`);
        console.log(`MATCH ${matchCount} — ${stub.id} (${stub.startInfo?.bracket ?? bracket}, ${date})`);
        console.log(sep);
        console.log(prompt);
      }
    }
  } finally {
    await fs.remove(tmpDir);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Total matches printed: ${matchCount}`);
}

// ---------------------------------------------------------------------------
// Local runner
// ---------------------------------------------------------------------------

async function runLocal(logDir: string) {
  const files = (await fs.readdir(logDir))
    .filter((f) => f.endsWith('.txt') && f.startsWith('WoWCombatLog'))
    .map((f) => path.join(logDir, f))
    .sort();

  if (files.length === 0) {
    console.error(`No WoWCombatLog*.txt files found in ${logDir}`);
    process.exit(1);
  }

  console.log(`Scanning ${files.length} log file(s) in ${logDir}\n`);
  let matchCount = 0;

  for (const logPath of files) {
    const fileName = path.basename(logPath);
    let combats: ParsedCombat[];
    try {
      combats = await parseLogText(await fs.readFile(logPath, 'utf-8'));
    } catch (e) {
      console.error(`Error parsing ${fileName}: ${e}`);
      continue;
    }
    if (combats.length === 0) continue;

    for (const combat of combats) {
      const prompt = buildMatchPrompt(combat);
      if (!prompt) continue;
      matchCount++;
      const sep = '='.repeat(80);
      console.log(`\n${sep}`);
      console.log(`MATCH ${matchCount} — ${fileName}`);
      console.log(sep);
      console.log(prompt);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Total matches printed: ${matchCount}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const localMode = args.includes('--local');
  const countIdx = args.indexOf('--count');
  const bracketIdx = args.indexOf('--bracket');
  const bracket = bracketIdx !== -1 ? args[bracketIdx + 1] : 'Rated Solo Shuffle';
  const count = countIdx !== -1 ? parseInt(args[countIdx + 1] ?? '10', 10) : 10;

  if (localMode) {
    const logDir = (process.env.LOG_DIR ?? path.join(process.env.HOME ?? os.homedir(), 'Downloads/wow logs')).replace(
      /^~/,
      os.homedir(),
    );
    await runLocal(logDir);
  } else {
    await runCloud(count, bracket);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
