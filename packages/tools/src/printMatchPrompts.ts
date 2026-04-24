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
 *   npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 3 --ai  (also calls Claude and prints responses)
 *   npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 3 --ai --test-prompt  (adds ## Prompt Feedback to each response)
 *   npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 1 --new-prompt  (uses raw timeline prompt path)
 *   npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 1 --compare --healer  (A/B: new vs hybrid + judge)
 */

import Anthropic from '@anthropic-ai/sdk';
import { CombatUnitReaction, CombatUnitType, IArenaMatch, ICombatUnit, IShuffleRound } from '@wowarenalogs/parser';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import os from 'os';
import path from 'path';

import {
  buildMatchArc,
  buildMatchTimeline,
  BuildMatchTimelineParams,
  buildPlayerLoadout,
  identifyCriticalMoments,
} from '../../shared/src/components/CombatReport/CombatAIAnalysis/utils';
import { NEW_SYSTEM_PROMPT, SYSTEM_PROMPT } from '../../shared/src/prompts/analyzeSystemPrompts';
import { analyzePlayerCCAndTrinket, formatCCTrinketForContext } from '../../shared/src/utils/ccTrinketAnalysis';
import {
  annotateDefensiveTimings,
  computePressureWindows,
  detectOverlappedDefensives,
  detectPanicDefensives,
  extractMajorCooldowns,
  fmtTime,
  formatOverlappedDefensivesForContext,
  formatPanicDefensivesForContext,
  getUnitHpAtTimestamp,
  IEnemyCDTimelineForTiming,
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
import { formatEnemyCDTimelineForContext, reconstructEnemyCDTimeline } from '../../shared/src/utils/enemyCDs';
import {
  analyzeHealerExposureAtBurst,
  formatHealerExposureForContext,
} from '../../shared/src/utils/healerExposureAnalysis';
import { detectHealingGaps, formatHealingGapsForContext } from '../../shared/src/utils/healingGaps';
import {
  analyzeKillWindowTargetSelection,
  formatKillWindowTargetSelectionForContext,
} from '../../shared/src/utils/killWindowTargetSelection';
import { computeMatchArchetype, formatMatchArchetypeForContext } from '../../shared/src/utils/matchArchetype';
import { computeOffensiveWindows, formatOffensiveWindowsForContext } from '../../shared/src/utils/offensiveWindows';
import { benchmarks, formatSpecBaselines } from '../../shared/src/utils/specBaselines';

const API_BASE = 'https://wowarenalogs.com';

// Test system prompt — extends SYSTEM_PROMPT with a meta-reflection section
// to help us understand how to improve the data we send and the prompts we write.
const TEST_SYSTEM_PROMPT =
  SYSTEM_PROMPT +
  `

---

PROMPT IMPROVEMENT FEEDBACK (append after your findings):

## Prompt Feedback

After your findings, add a short section titled "## Prompt Feedback" with:

1. **Most useful data**: Which sections of the input most directly supported your analysis? (e.g., CRITICAL MOMENTS, MATCH ARC, enemy CD timeline)
2. **Least useful / redundant data**: What did you barely use or find noisy? Why?
3. **Missing data**: What information was absent that would have materially changed your confidence or conclusions? Be specific — e.g., "HP% at the time of the trade", "whether X was interrupted", "exact DR timers for the CC chain".
4. **Ambiguities**: Any moments where the structured data conflicted, was self-contradictory, or left you guessing?
5. **One prompt rule change**: If you could rewrite one rule in your system instructions to produce better analysis, what would it be and why?

Keep this section under 200 words. Be blunt — this feedback is for internal use to improve the prompting pipeline, not for the player.`;

// Hybrid system prompt — incorporates structured verdict labels and two-pass identification
// from ChatGPT suggestion, layered onto the existing raw-timeline rules.
const HYBRID_SYSTEM_PROMPT = `You are an expert World of Warcraft arena PvP analyst reviewing raw match timeline data for a player performing at Gladiator or R1 level.

Core rules:
- Evaluate only what the data shows. Never invent events, timestamps, or spells not present in the data.
- Only reference a spell if it appears in PLAYER LOADOUT or the timeline. Never say "you should have used X" if X is not listed — it may not be in the player's build.
- Express uncertainty explicitly. Avoid "must", "always", "should have" — prefer "likely", "probably", "the log suggests", "without HP data it's unclear whether...".
- This player already plays correctly most of the time. Focus on timing, trades, and decision quality — not rule-based mistakes.
- For purge analysis: check PURGE RESPONSIBILITY before attributing missed purges. Do not blame the log owner for purges if they cannot offensive purge.
- Ability absence: if a spell appears in PLAYER LOADOUT but has no cast in the timeline, that absence is notable only when (a) another ability from the same player appears in the timeline AND (b) the absent ability's function would have been relevant to a specific identified moment. Flag absence as a potential decision gap with stated uncertainty — never treat it as confirmed.
- Teammate ability absence follows the same rule. If talent-gating is plausible, flag that caveat explicitly.

Your task is two-pass:

PASS 1 — Identify decision windows. Read the full timeline and silently identify up to 5 decision windows that most affected match outcome, ranked by: death risk > major CD overlap > momentum swing. Do not write this list in your output — use it to anchor PASS 2.

PASS 2 — Evaluate each window. For each window from PASS 1, evaluate:
1. Was this the correct trade given the available information?
2. What was the most likely alternative decision?
3. What is the estimated impact difference between the two choices?
4. What uncertainty prevents a definitive verdict?

Output format — exactly 5 findings maximum (fewer only if fewer meaningful decision points exist), ranked by estimated match impact. Most impactful first:

## Finding 1: [short title]
**What happened:** [one sentence]
**Alternative:** [the most likely correct play — one sentence]
**Impact:** [why the difference matters — specific to timing, CD value, or match outcome]
**Verdict:** GOOD / SUBOPTIMAL / BAD
**Severity:** HIGH (likely changes outcome) / MEDIUM / LOW
**Fix:** [one concrete behavioral adjustment directly applicable in the next game — one line only]

## Finding 2: ...
## Finding 3: ...

After your findings, add a Data Utility section:

## Data Utility

### Used — directly informed a finding
- [event type or specific event]: [how it was used]

### Present but unused
- [event type or specific event]: [why it didn't contribute]

### Missing — would have changed confidence or a finding
- [what you needed]: [which finding it would affect]

### One change
[Single most impactful prompt or data improvement you'd make]

Do not add a summary, "what went well" section, or general recommendations beyond the numbered findings and Data Utility section.`;

// Baseline new-prompt — the raw-timeline prompt BEFORE counterfactual reasoning rules were added.
// Used for A/B testing to measure the impact of the [RESOURCES] annotation + reasoning checks.
const BASELINE_NEW_SYSTEM_PROMPT = `You are an expert World of Warcraft arena PvP analyst reviewing raw match timeline data for a player performing at Gladiator or R1 level.

Core rules:
- Evaluate only what the data shows. Never invent events, timestamps, or spells not present in the data.
- Only reference a spell if it appears in PLAYER LOADOUT or the timeline. Never say "you should have used X" if X is not listed — it may not be in the player's build.
- Express uncertainty explicitly. Avoid "must", "always", "should have" — prefer "likely", "probably", "the log suggests", "without HP data it's unclear whether...".
- This player already plays correctly most of the time. Focus on timing, trades, and decision quality — not rule-based mistakes.
- For purge analysis: check PURGE RESPONSIBILITY before attributing missed purges. Do not blame the log owner for purges if they cannot offensive purge.
- Ability absence: if a spell appears in PLAYER LOADOUT but has no cast in the timeline, that absence is notable only when (a) another ability from the same player appears in the timeline AND (b) the absent ability's function would have been relevant to a specific identified moment. Flag absence as a potential decision gap with stated uncertainty — never treat it as confirmed.
- Teammate ability absence follows the same rule. If talent-gating is plausible, flag that caveat explicitly.

Your task:
You are given a PLAYER LOADOUT (all major CDs available this match) and a MATCH TIMELINE (raw chronological events — no pre-selected moments, no pre-drawn conclusions).

Identify the most important decision points yourself. Read the full timeline, build your own causal narrative about what happened and why, then evaluate the decisions that most affected match outcome.

For each decision point you identify, evaluate:
1. Was this the correct trade given the available information?
2. What was the most likely alternative decision?
3. What is the estimated impact difference between the two choices?
4. What uncertainty prevents a definitive verdict?

Output format — exactly 5 findings maximum (fewer only if fewer meaningful decision points exist), ranked by estimated match impact. Most impactful first:

## Finding 1: [short title]
**What happened:** [one sentence]
**Alternative:** [the most likely correct play — one sentence]
**Impact:** [why the difference matters — specific to timing, CD value, or match outcome]
**Confidence:** [High/Medium/Low] — [one sentence on key uncertainty]

## Finding 2: ...
## Finding 3: ...

After your findings, add a Data Utility section:

## Data Utility

### Used — directly informed a finding
- [event type or specific event]: [how it was used]

### Present but unused
- [event type or specific event]: [why it didn't contribute]

### Missing — would have changed confidence or a finding
- [what you needed]: [which finding it would affect]

### One change
[Single most impactful prompt or data improvement you'd make]

Do not add a summary, "what went well" section, or general recommendations beyond the numbered findings and Data Utility section.`;

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
// AI call
// ---------------------------------------------------------------------------

async function callClaude(
  prompt: string,
  mode: 'standard' | 'test' | 'new' | 'hybrid' | 'baseline' = 'standard',
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return '[AI SKIPPED — set ANTHROPIC_API_KEY env var to enable]';
  }
  const client = new Anthropic({ apiKey });
  const systemPrompt =
    mode === 'hybrid'
      ? HYBRID_SYSTEM_PROMPT
      : mode === 'baseline'
        ? BASELINE_NEW_SYSTEM_PROMPT
        : mode === 'new'
          ? NEW_SYSTEM_PROMPT
          : mode === 'test'
            ? TEST_SYSTEM_PROMPT
            : SYSTEM_PROMPT;
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6144,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });
  const content = message.content[0];
  if (content.type !== 'text') return '[AI returned non-text response]';
  return content.text;
}

async function callClaudeJudge(matchPrompt: string, responseA: string, responseB: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return '[AI SKIPPED — set ANTHROPIC_API_KEY env var to enable]';
  const client = new Anthropic({ apiKey });

  const judgeSystem = `You are a prompt engineer evaluating two AI-generated WoW arena match analyses produced from identical match data. Your job is to give a blunt, concrete verdict on which prompt design produced better output. You have no stake in either approach — judge purely on output quality.`;

  const userMessage = `Below are two analyses of the same WoW arena match. Both used the same raw timeline data as input.

ANALYSIS A — Current prompt (Findings with Confidence field + Data Utility section):
---
${responseA}
---

ANALYSIS B — Hybrid prompt (two-pass identification, Verdict/Severity/Fix instead of Confidence):
---
${responseB}
---

Rate each analysis on four dimensions (score 1–5 each):

**Actionability** — Does the output give advice the player can act on immediately in their next game?
**Evidence discipline** — Are claims grounded in specific timeline events, not inference-on-inference?
**Insight depth** — Does it surface non-obvious decision points the player might not have noticed?
**Signal/noise** — Is the output free of filler, redundant framing, or padding?

For each dimension, state the score for A and B and one sentence on why.

Then:
- **Winner overall:** A / B / Tie
- **Deciding factor:** one sentence
- **Top improvement for the loser:** one concrete prompt change (not "be more specific" — name what to add or remove)
- **One element from the loser worth keeping:** what should be transplanted into the winner`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    temperature: 0.2,
    system: judgeSystem,
    messages: [{ role: 'user', content: userMessage }],
  });
  const content = message.content[0];
  if (content.type !== 'text') return '[Judge returned non-text response]';
  return content.text;
}

// ---------------------------------------------------------------------------
// Build full prompt — mirrors buildMatchContext() in CombatAIAnalysis/index.tsx
// ---------------------------------------------------------------------------

// Cloud matches have no single "owner" — pick friendly[0] as the log owner proxy
function buildMatchPrompt(combat: ParsedCombat, forceHealer = false): string {
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

  // Pick log owner: --healer forces a healer; otherwise prefer non-healer DPS
  const owner = forceHealer
    ? (friends.find((p) => isHealerSpec(p.spec)) ?? friends[0])
    : (friends.find((p) => !isHealerSpec(p.spec)) ?? friends.find((p) => isHealerSpec(p.spec)) ?? friends[0]);

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
      p.deathRecords.map((d) => {
        const atSeconds = (d.timestamp - combat.startTime) / 1000;
        const hpBeforeDeath = getUnitHpAtTimestamp(p, d.timestamp - 3_000);
        return { spec: specToString(p.spec), name: p.name, atSeconds, hpBeforeDeath };
      }),
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
    ...friendlyDeaths.map((d) => {
      const hp = d.hpBeforeDeath !== null && d.hpBeforeDeath !== undefined ? ` ${d.hpBeforeDeath}% HP at T-3s` : '';
      return `${d.spec} (my team, ${fmtTime(d.atSeconds)}${hp})`;
    }),
    ...enemyDeaths.map((d) => `${d.spec} (enemy, ${fmtTime(d.atSeconds)})`),
  ];
  lines.push(`  Deaths: ${deathParts.length > 0 ? deathParts.join(', ') : 'None'}`);
  lines.push('');
  formatMatchArchetypeForContext(matchArchetype).forEach((l) => lines.push(l));

  // ── MATCH ARC ──────────────────────────────────────────────────────────────
  lines.push('');
  const allTeamCooldownsWithPlayer = [
    ...cooldowns.map((cd) => ({ player: owner, cd })),
    ...teammateCooldowns.flatMap(({ player, cds }) => cds.map((cd) => ({ player, cd }))),
  ];
  buildMatchArc(
    enemyCDTimeline,
    allTeamCooldownsWithPlayer,
    friendlyDeaths,
    durationSeconds,
    combat.startInfo.bracket,
  ).forEach((l) => lines.push(l));

  // ── CRITICAL MOMENTS ───────────────────────────────────────────────────────
  lines.push('');
  lines.push('CRITICAL MOMENTS (interpret as a sequence where earlier events constrain later options):');
  lines.push('');

  if (criticalMoments.length === 0) {
    // Fallback: derive top signals from supporting data so the prompt is not architecturally orphaned
    const fallbackMoments: string[] = [];

    // 1. Highest-danger burst window
    const topBurst = [...enemyCDTimeline.alignedBurstWindows].sort((a, b) => b.dangerScore - a.dangerScore)[0];
    if (topBurst) {
      const cdNames = topBurst.activeCDs.map((c) => c.spellName).join(' + ');
      fallbackMoments.push(
        `[Derived] Peak enemy burst at ${fmtTime(topBurst.fromSeconds)}–${fmtTime(topBurst.toSeconds)} (${topBurst.dangerLabel}, ${cdNames}) — evaluate whether defensive response was optimal`,
      );
    }

    // 2. Never-used teammate CDs where the player has other recorded casts
    for (const { player, cds } of teammateCooldowns) {
      const hasAnyCast = cds.some((cd) => !cd.neverUsed);
      if (!hasAnyCast) continue;
      for (const cd of cds) {
        if (cd.neverUsed) {
          fallbackMoments.push(
            `[Derived] ${specToString(player.spec)}'s ${cd.spellName} [${cd.cooldownSeconds}s CD] was never used — evaluate whether a use was warranted given match pressure`,
          );
          break;
        }
      }
    }

    // 3. Missed dispel opportunities
    if (dispelSummary.missedCleanseWindows.length > 0) {
      fallbackMoments.push(
        `[Derived] ${dispelSummary.missedCleanseWindows.length} missed cleanse opportunity(s) detected — evaluate timing and prioritisation`,
      );
    }

    if (fallbackMoments.length === 0) {
      lines.push('  No critical moments identified from available data.');
    } else {
      lines.push(
        '  NOTE: No primary critical moments detected. The following are derived from highest-signal supporting data:',
      );
      lines.push('');
      fallbackMoments.forEach((m, i) => {
        lines.push(`--- MOMENT ${i + 1} [Derived] ---`);
        lines.push(`  ${m}`);
        lines.push('');
      });
    }
  } else {
    criticalMoments.forEach((m, i) => {
      const impactStr = m.roleLabel === 'Constraint' ? 'Context-setting — not a mistake' : m.impactLabel;
      lines.push(`--- MOMENT ${i + 1} [${m.roleLabel}] (impact: ${impactStr}) ---`);
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
            if (m.roleLabel === 'Setup') {
              lines.push(`  → This committed resources ${deltaSeconds}s before they were needed at the kill window.`);
            } else if (m.roleLabel === 'Consequence') {
              lines.push(
                `  → Resources were already depleted from an earlier commitment — ${deltaSeconds}s gap to the death.`,
              );
            }
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

  const baselineLines = formatSpecBaselines(ownerSpec, cooldowns, benchmarks);
  if (baselineLines.length > 0) {
    lines.push('');
    baselineLines.forEach((l) => lines.push(l));
  }

  lines.push('');
  lines.push(`COOLDOWN USAGE — LOG OWNER (${ownerSpec}) — major CDs ≥30s:`);
  if (cooldowns.length === 0) {
    lines.push('  No major cooldown data found for this spec.');
  } else {
    cooldowns.forEach((cd) => {
      lines.push('');
      const chargesSuffix = cd.maxChargesDetected > 1 ? `, ${cd.maxChargesDetected} Charges` : '';
      lines.push(`  ${cd.spellName} [${cd.tag}, ${cd.cooldownSeconds}s CD${chargesSuffix}]:`);
      if (cd.neverUsed) {
        lines.push(`    STATUS: NEVER USED`);
      } else {
        cd.casts.forEach((c) => {
          const timing =
            c.timingLabel && c.timingLabel !== 'Unknown'
              ? ` [${c.timingLabel.toUpperCase()}${c.timingContext ? ` — ${c.timingContext}` : ''}]`
              : '';
          const targetStr = c.targetName ? ` → on: ${c.targetName}` : '';
          const hpStr = c.targetHpPct !== undefined ? ` (target ${c.targetHpPct}% HP)` : '';
          lines.push(`    Cast at: ${fmtTime(c.timeSeconds)}${timing}${targetStr}${hpStr}`);
        });
      }
      if (cd.availableWindows.length > 0) {
        lines.push(`    Pressure correlation (counterfactual unknown — not evidence of missed opportunity):`);
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

  // Trinket timestamps for log owner (sourced from ccTrinketAnalysis — not in major CD list)
  const ownerTrinket = ccTrinketSummaries.find((s) => s.playerName === owner.name);
  if (ownerTrinket && ownerTrinket.trinketType !== 'Unknown') {
    const trinketLabel =
      ownerTrinket.trinketType === 'Relentless'
        ? 'Relentless (passive)'
        : `${ownerTrinket.trinketType} trinket [${ownerTrinket.trinketCooldownSeconds}s CD]`;
    if (ownerTrinket.trinketUseTimes.length === 0) {
      lines.push('');
      lines.push(`  PvP Trinket — ${trinketLabel}: STATUS: NEVER USED`);
    } else {
      lines.push('');
      lines.push(`  PvP Trinket — ${trinketLabel}: cast at ${ownerTrinket.trinketUseTimes.map(fmtTime).join(', ')}`);
    }
    if (ownerTrinket.missedTrinketWindows.length > 0) {
      const totalDmg = ownerTrinket.missedTrinketWindows.reduce((s, w) => s + w.damageTakenDuring, 0);
      lines.push(
        `    ⚠ ${ownerTrinket.missedTrinketWindows.length} missed trinket window(s) — ${Math.round(totalDmg / 1000)}k dmg while trinket available`,
      );
    }
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
          const tmChargesSuffix = cd.maxChargesDetected > 1 ? `, ${cd.maxChargesDetected} Charges` : '';
          lines.push(`    ${cd.spellName} [${cd.cooldownSeconds}s CD${tmChargesSuffix}]: NEVER USED`);
        } else {
          const tmChargesSuffix = cd.maxChargesDetected > 1 ? `, ${cd.maxChargesDetected} Charges` : '';
          const castStr = cd.casts.map((c) => fmtTime(c.timeSeconds)).join(', ');
          const idleStr =
            cd.availableWindows.length > 0
              ? ` | idle: ${cd.availableWindows.map((w) => `${fmtTime(w.fromSeconds)}–${fmtTime(w.toSeconds)}`).join(', ')}`
              : '';
          lines.push(`    ${cd.spellName} [${cd.cooldownSeconds}s CD${tmChargesSuffix}]: cast at ${castStr}${idleStr}`);
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

  // Suppress ENEMY VULNERABILITY WINDOWS for healer log owners when no friendly offensive CDs
  // are tracked — every window would say "friendly offensive CDs: none tracked" which is noise
  const hasAnyFriendlyOffensiveCDs = offensiveWindows.some((w) => w.friendlyOffensives.length > 0);
  if (!healer || hasAnyFriendlyOffensiveCDs) {
    lines.push('');
    formatOffensiveWindowsForContext(offensiveWindows).forEach((l) => lines.push(l));
  }

  // Skip kill window target selection when log owner is a healer — they observe but cannot enforce target choices
  if (!healer) {
    const targetSelectionLines = formatKillWindowTargetSelectionForContext(killWindowTargetEvals);
    if (targetSelectionLines.length > 0) {
      lines.push('');
      targetSelectionLines.forEach((l) => lines.push(l));
    }
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
// Build new raw timeline prompt — uses buildPlayerLoadout + buildMatchTimeline
// ---------------------------------------------------------------------------

function buildMatchPromptNew(combat: ParsedCombat, forceHealer = false): string {
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

  const owner = forceHealer
    ? (friends.find((p) => isHealerSpec(p.spec)) ?? friends[0])
    : (friends.find((p) => !isHealerSpec(p.spec)) ?? friends.find((p) => isHealerSpec(p.spec)) ?? friends[0]);

  const ownerSpec = specToString(owner.spec);
  const isHealer = isHealerSpec(owner.spec);
  const myTeam = friends.map((p) => specToString(p.spec)).join(', ');
  const enemyTeam = enemies.map((p) => specToString(p.spec)).join(', ');

  const combatAny = combat as unknown as Record<string, unknown>;
  const playerWon =
    typeof combatAny['winningTeamId'] === 'string' ? combatAny['winningTeamId'] === combat.playerTeamId : null;
  const resultStr = playerWon === true ? 'Win' : playerWon === false ? 'Loss' : 'Unknown';

  const ownerCDs = extractMajorCooldowns(owner, combat);
  const teammateCDs = friends
    .filter((p) => p.id !== owner.id)
    .map((p) => ({ player: p, spec: specToString(p.spec), cds: extractMajorCooldowns(p, combat) }));
  const enemyCDTimeline = reconstructEnemyCDTimeline(enemies, combat, owner, friends);
  const pressureWindows = computePressureWindows(friends, combat);
  const healingGaps = isHealer ? detectHealingGaps(owner, friends, enemies, combat) : [];
  const dispelSummary = reconstructDispelSummary(friends, enemies, combat);
  const ccTrinketSummaries = friends.map((p) => analyzePlayerCCAndTrinket(p, enemies, combat));
  const ownerCanPurge = canOffensivePurge(owner);
  const teamPurgers = friends.filter((p) => p.id !== owner.id && canOffensivePurge(p)).map((p) => specToString(p.spec));

  const friendlyDeaths = friends
    .flatMap((p) =>
      p.deathRecords.map((d) => ({
        spec: specToString(p.spec),
        name: p.name,
        atSeconds: (d.timestamp - combat.startTime) / 1000,
      })),
    )
    .sort((a, b) => a.atSeconds - b.atSeconds);

  const enemyDeaths = enemies
    .flatMap((p) =>
      p.deathRecords.map((d) => ({
        spec: specToString(p.spec),
        name: p.name,
        atSeconds: (d.timestamp - combat.startTime) / 1000,
      })),
    )
    .sort((a, b) => a.atSeconds - b.atSeconds);

  const lines: string[] = [];

  // Context block
  lines.push('ARENA MATCH — ANALYSIS REQUEST');
  lines.push('');
  lines.push('MATCH FACTS');
  lines.push(
    `  Spec: ${ownerSpec}${isHealer ? ' (Healer)' : ''} | Bracket: ${combat.startInfo?.bracket ?? 'Unknown'} | Result: ${resultStr} | Duration: ${fmtTime(durationSeconds)}`,
  );
  lines.push(`  My team: ${myTeam}`);
  lines.push(`  Enemy team: ${enemyTeam}`);
  lines.push('');

  lines.push('PURGE RESPONSIBILITY');
  lines.push(`  Log owner (${ownerSpec}): ${ownerCanPurge ? 'CAN offensive purge' : 'CANNOT offensive purge'}`);
  lines.push(`  Team purgers: ${teamPurgers.length > 0 ? teamPurgers.join(', ') : 'none'}`);
  lines.push('');

  const specBaselineLines = formatSpecBaselines(ownerSpec, ownerCDs, benchmarks);
  if (specBaselineLines.length > 0) {
    lines.push(...specBaselineLines);
    lines.push('');
  }

  const dampeningLines = formatDampeningForContext(
    combat.startInfo?.bracket ?? '3v3',
    [...friends, ...enemies],
    combat.startTime,
    combat.endTime,
  );
  if (dampeningLines.length > 0) {
    lines.push(...dampeningLines);
    lines.push('');
  }

  // Player loadout
  const {
    text: loadoutText,
    playerIdMap,
    enemyIdMap,
  } = buildPlayerLoadout(owner, ownerSpec, ownerCDs, teammateCDs, enemyCDTimeline, enemies);
  lines.push(loadoutText);
  lines.push('');

  // Timeline
  const params: BuildMatchTimelineParams = {
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
    matchStartMs: combat.startTime,
    matchEndMs: combat.endTime,
    isHealer,
    playerIdMap,
    enemyIdMap,
  };
  lines.push(buildMatchTimeline(params));

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Print one match (prompt + optional AI response)
// ---------------------------------------------------------------------------

interface PrintMatchOptions {
  testPromptMode?: boolean;
  useNewPrompt?: boolean;
  compareMode?: boolean;
}

async function printMatch(
  matchLabel: string,
  prompt: string,
  matchIndex: number,
  aiMode: boolean,
  options: PrintMatchOptions = {},
): Promise<void> {
  const { testPromptMode = false, useNewPrompt = false, compareMode = false } = options;
  const sep = '='.repeat(80);
  console.log(`\n${sep}`);
  console.log(`MATCH ${matchIndex} — ${matchLabel}`);
  console.log(sep);
  console.log('\n--- PROMPT ---\n');
  console.log(prompt);

  if (compareMode) {
    process.stderr.write(
      `  A/B compare for match ${matchIndex}: calling Claude x2 (baseline vs new with [RESOURCES] + counterfactual rules)...\n`,
    );
    try {
      const [responseA, responseB] = await Promise.all([callClaude(prompt, 'baseline'), callClaude(prompt, 'new')]);
      console.log('\n--- ANALYSIS A (baseline — raw timeline, no counterfactual rules) ---\n');
      console.log(responseA);
      console.log('\n--- ANALYSIS B (new — [RESOURCES] blocks + 4 counterfactual reasoning checks) ---\n');
      console.log(responseB);
      process.stderr.write(`  Calling Claude judge...\n`);
      const judgment = await callClaudeJudge(prompt, responseA, responseB);
      console.log('\n--- JUDGE VERDICT ---\n');
      console.log(judgment);
    } catch (e) {
      console.log(`[Compare failed: ${e}]`);
    }
    return;
  }

  if (aiMode) {
    const modeTag = useNewPrompt ? ' [new-prompt]' : testPromptMode ? ' [test-prompt]' : '';
    const label = useNewPrompt
      ? 'AI RESPONSE (new-prompt mode — raw timeline path)'
      : testPromptMode
        ? 'AI RESPONSE (test-prompt mode — includes feedback section)'
        : 'AI RESPONSE';
    console.log(`\n--- ${label} ---\n`);
    process.stderr.write(`  Calling Claude for match ${matchIndex}${modeTag}...\n`);
    const mode = useNewPrompt ? 'new' : testPromptMode ? 'test' : 'standard';
    try {
      const response = await callClaude(prompt, mode);
      console.log(response);
    } catch (e) {
      console.log(`[AI call failed: ${e}]`);
    }
  }
}

// ---------------------------------------------------------------------------
// Cloud runner
// ---------------------------------------------------------------------------

interface RunOptions {
  testPromptMode?: boolean;
  forceHealer?: boolean;
  useNewPrompt?: boolean;
  compareMode?: boolean;
}

async function runCloud(count: number, bracket: string, aiMode: boolean, options: RunOptions = {}) {
  const { testPromptMode = false, forceHealer = false, useNewPrompt = false, compareMode = false } = options;
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
        // compare mode always uses the new timeline prompt as input (includes [RESOURCES] blocks)
        const prompt =
          compareMode || useNewPrompt
            ? buildMatchPromptNew(combat, forceHealer)
            : buildMatchPrompt(combat, forceHealer);
        if (!prompt) continue;
        matchCount++;
        const label = `${stub.id} (${stub.startInfo?.bracket ?? bracket}, ${date})`;
        await printMatch(label, prompt, matchCount, aiMode, { testPromptMode, useNewPrompt, compareMode });
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

async function runLocal(logDir: string, aiMode: boolean, options: RunOptions = {}) {
  const { testPromptMode = false, forceHealer = false, useNewPrompt = false, compareMode = false } = options;
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
      const prompt =
        compareMode || useNewPrompt ? buildMatchPromptNew(combat, forceHealer) : buildMatchPrompt(combat, forceHealer);
      if (!prompt) continue;
      matchCount++;
      await printMatch(fileName, prompt, matchCount, aiMode, { testPromptMode, useNewPrompt, compareMode });
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
  const aiMode = args.includes('--ai');
  const testPromptMode = args.includes('--test-prompt');
  const forceHealer = args.includes('--healer');
  const useNewPrompt = args.includes('--new-prompt');
  const compareMode = args.includes('--compare');
  const countIdx = args.indexOf('--count');
  const bracketIdx = args.indexOf('--bracket');
  const bracket = bracketIdx !== -1 ? args[bracketIdx + 1] : 'Rated Solo Shuffle';
  const count = countIdx !== -1 ? parseInt(args[countIdx + 1] ?? '10', 10) : 10;

  if (compareMode) {
    if (!process.env.ANTHROPIC_API_KEY) {
      process.stderr.write('Warning: --compare requires ANTHROPIC_API_KEY. Responses will be skipped.\n');
    } else {
      process.stderr.write(
        'Compare mode — baseline vs new ([RESOURCES] + counterfactual rules), judge side-by-side.\n',
      );
    }
  } else if (aiMode) {
    if (!process.env.ANTHROPIC_API_KEY) {
      process.stderr.write(
        'Warning: --ai flag set but ANTHROPIC_API_KEY not found in environment. Responses will be skipped.\n',
      );
    } else {
      const modeLabel = useNewPrompt
        ? ' (new-prompt mode — raw timeline path)'
        : testPromptMode
          ? ' (test-prompt mode — responses include ## Prompt Feedback section)'
          : '';
      process.stderr.write(`AI mode enabled — will call Claude after each match prompt${modeLabel}.\n`);
    }
  }

  if (localMode) {
    const logDir = (process.env.LOG_DIR ?? path.join(process.env.HOME ?? os.homedir(), 'Downloads/wow logs')).replace(
      /^~/,
      os.homedir(),
    );
    await runLocal(logDir, aiMode, { testPromptMode, forceHealer, useNewPrompt, compareMode });
  } else {
    await runCloud(count, bracket, aiMode, { testPromptMode, forceHealer, useNewPrompt, compareMode });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
