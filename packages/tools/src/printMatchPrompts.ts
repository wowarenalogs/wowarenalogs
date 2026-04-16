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
 */

import Anthropic from '@anthropic-ai/sdk';
import { CombatUnitReaction, CombatUnitType, IArenaMatch, ICombatUnit, IShuffleRound } from '@wowarenalogs/parser';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import os from 'os';
import path from 'path';

import {
  buildMatchArc,
  identifyCriticalMoments,
} from '../../shared/src/components/CombatReport/CombatAIAnalysis/utils';
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

const API_BASE = 'https://wowarenalogs.com';

// System prompt — identical to packages/web/pages/api/analyze.ts SYSTEM_PROMPT
const SYSTEM_PROMPT = `You are an expert World of Warcraft arena PvP analyst reviewing structured match data for a player performing at Gladiator or R1 level. Your role is a constrained evaluator — not a free-form coach.

Core rules:
- Evaluate only what the data shows. Never invent events, timestamps, or spells not present in the data.
- Only reference a spell if it appears in the COOLDOWN USAGE section or you observed it cast. Never say "you should have used X" if X is not listed — it may not be in the player's build.
- Express uncertainty explicitly. Avoid "must", "always", "should have" — prefer "likely", "probably", "the log suggests", "without HP data it's unclear whether...".
- This player already plays correctly most of the time. Focus on timing, trades, and decision quality — not rule-based mistakes.
- For purge analysis: check PURGE RESPONSIBILITY before attributing missed purges. Do not blame the log owner for purges if they cannot offensive purge.
- NEVER USED or "no cast recorded" anywhere in this data means only that the cast was not recorded. Do not conclude the ability was not needed, not appropriate, or irrelevant — or draw any inference from its absence. The counterfactual (would using it have changed the outcome?) cannot be determined from combat log data.

Your task:
The CRITICAL MOMENTS section represents the most important events in the match. Interpret them as a sequence where earlier events constrain later options — not as independent problems. Use the MATCH ARC section to understand the causal structure before evaluating individual moments. Use supporting data only to verify or refine your conclusions, not to introduce unrelated issues.

For each CRITICAL MOMENT listed in the input, evaluate the decision:
1. Was this the correct trade given the available information?
2. What was the most likely alternative decision?
3. What is the estimated impact difference between the two choices?
4. What uncertainty prevents a definitive verdict?

Output format — exactly 5 findings maximum (fewer only if fewer moments exist), ranked by estimated match impact. Most impactful first:

## Finding 1: [short title]
**What happened:** [one sentence]
**Alternative:** [the most likely correct play — one sentence]
**Impact:** [why the difference matters — specific to timing, CD value, or match outcome]
**Confidence:** [High/Medium/Low] — [one sentence on key uncertainty]

## Finding 2: ...
## Finding 3: ...

Do not add a summary, "what went well" section, or general recommendations. Output only the numbered findings.`;

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

async function callClaude(prompt: string, testPromptMode = false): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return '[AI SKIPPED — set ANTHROPIC_API_KEY env var to enable]';
  }
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: testPromptMode ? TEST_SYSTEM_PROMPT : SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  const content = message.content[0];
  if (content.type !== 'text') return '[AI returned non-text response]';
  return content.text;
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
    lines.push('  No critical moments identified from available data.');
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
// Print one match (prompt + optional AI response)
// ---------------------------------------------------------------------------

async function printMatch(
  matchLabel: string,
  prompt: string,
  matchIndex: number,
  aiMode: boolean,
  testPromptMode = false,
): Promise<void> {
  const sep = '='.repeat(80);
  console.log(`\n${sep}`);
  console.log(`MATCH ${matchIndex} — ${matchLabel}`);
  console.log(sep);
  console.log('\n--- PROMPT ---\n');
  console.log(prompt);

  if (aiMode) {
    const label = testPromptMode ? 'AI RESPONSE (test-prompt mode — includes feedback section)' : 'AI RESPONSE';
    console.log(`\n--- ${label} ---\n`);
    process.stderr.write(`  Calling Claude for match ${matchIndex}${testPromptMode ? ' [test-prompt]' : ''}...\n`);
    try {
      const response = await callClaude(prompt, testPromptMode);
      console.log(response);
    } catch (e) {
      console.log(`[AI call failed: ${e}]`);
    }
  }
}

// ---------------------------------------------------------------------------
// Cloud runner
// ---------------------------------------------------------------------------

async function runCloud(count: number, bracket: string, aiMode: boolean, testPromptMode = false) {
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
        const label = `${stub.id} (${stub.startInfo?.bracket ?? bracket}, ${date})`;
        await printMatch(label, prompt, matchCount, aiMode, testPromptMode);
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

async function runLocal(logDir: string, aiMode: boolean, testPromptMode = false) {
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
      await printMatch(fileName, prompt, matchCount, aiMode, testPromptMode);
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
  const countIdx = args.indexOf('--count');
  const bracketIdx = args.indexOf('--bracket');
  const bracket = bracketIdx !== -1 ? args[bracketIdx + 1] : 'Rated Solo Shuffle';
  const count = countIdx !== -1 ? parseInt(args[countIdx + 1] ?? '10', 10) : 10;

  if (aiMode) {
    if (!process.env.ANTHROPIC_API_KEY) {
      process.stderr.write(
        'Warning: --ai flag set but ANTHROPIC_API_KEY not found in environment. Responses will be skipped.\n',
      );
    } else {
      const modeLabel = testPromptMode ? ' (test-prompt mode — responses include ## Prompt Feedback section)' : '';
      process.stderr.write(`AI mode enabled — will call Claude after each match prompt${modeLabel}.\n`);
    }
  }

  if (localMode) {
    const logDir = (process.env.LOG_DIR ?? path.join(process.env.HOME ?? os.homedir(), 'Downloads/wow logs')).replace(
      /^~/,
      os.homedir(),
    );
    await runLocal(logDir, aiMode, testPromptMode);
  } else {
    await runCloud(count, bracket, aiMode, testPromptMode);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
