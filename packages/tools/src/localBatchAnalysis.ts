/* eslint-disable no-console */
/**
 * localBatchAnalysis.ts
 *
 * Phase 1: For each match in ~/Downloads/wow logs/, build the AI prompt,
 *           call Claude (test-prompt mode — includes ## Prompt Feedback), and
 *           save a structured record to packages/tools/local-batch/results.jsonl.
 *
 * Phase 2: Read all saved records, build a meta-analysis prompt, call Claude
 *           once, and write packages/tools/local-batch/summary.md.
 *
 * Usage:
 *   npm run -w @wowarenalogs/tools start:localBatchAnalysis
 *   npm run -w @wowarenalogs/tools start:localBatchAnalysis -- --phase1-only
 *   npm run -w @wowarenalogs/tools start:localBatchAnalysis -- --phase2-only
 *
 * Env vars:
 *   ANTHROPIC_API_KEY   required for AI calls
 *   LOG_DIR             override log directory (default ~/Downloads/wow logs)
 */

import Anthropic from '@anthropic-ai/sdk';
import { CombatUnitReaction, CombatUnitType, IArenaMatch, IShuffleRound } from '@wowarenalogs/parser';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import { buildMatchPrompt, callClaude, ParsedCombat, parseLogText } from './printMatchPrompts';

// ── Config ────────────────────────────────────────────────────────────────────

const LOG_DIR = process.env.LOG_DIR ?? path.join(os.homedir(), 'Downloads/wow logs');
const OUTPUT_DIR = path.join(__dirname, '../local-batch');
const RESULTS_FILE = path.join(OUTPUT_DIR, 'results.jsonl');
const SUMMARY_FILE = path.join(OUTPUT_DIR, 'summary.md');

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchMeta {
  logFile: string;
  matchIndex: number;
  spec: string;
  bracket: string;
  result: 'Win' | 'Loss' | 'Unknown';
  durationSeconds: number;
  myTeam: string[];
  enemyTeam: string[];
  processedAt: string;
}

interface BatchRecord {
  meta: MatchMeta;
  prompt: string;
  aiResponse: string;
  feedbackSection: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function specLabel(spec: string | number): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CombatUnitSpec } = require('@wowarenalogs/parser') as typeof import('@wowarenalogs/parser');
  const key = Object.keys(CombatUnitSpec).find(
    (k) => CombatUnitSpec[k as keyof typeof CombatUnitSpec] === String(spec),
  );
  return key ?? `Spec ${spec}`;
}

function extractMatchMeta(combat: ParsedCombat, logFile: string, matchIndex: number): MatchMeta {
  const allUnits = Object.values(combat.units);
  const friends = allUnits.filter(
    (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Friendly,
  );
  const enemies = allUnits.filter((u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Hostile);

  const durationSeconds = (combat.endTime - combat.startTime) / 1000;
  const combatAny = combat as unknown as Record<string, unknown>;
  const playerWon =
    typeof combatAny['winningTeamId'] === 'string' ? combatAny['winningTeamId'] === combat.playerTeamId : null;

  const isHealer = (spec: string | number) => {
    const label = specLabel(spec).toLowerCase();
    return (
      label.includes('resto') ||
      label.includes('holy') ||
      label.includes('disc') ||
      label.includes('mistweaver') ||
      label.includes('preservation')
    );
  };
  const owner = friends.find((p) => !isHealer(p.spec)) ?? friends[0];
  const ownerSpec = owner ? specLabel(owner.spec) : 'Unknown';

  return {
    logFile: path.basename(logFile),
    matchIndex,
    spec: ownerSpec,
    bracket: (combat as IArenaMatch).startInfo?.bracket ?? (combat as IShuffleRound).startInfo?.bracket ?? 'Unknown',
    result: playerWon === true ? 'Win' : playerWon === false ? 'Loss' : 'Unknown',
    durationSeconds: Math.round(durationSeconds),
    myTeam: friends.map((p) => specLabel(p.spec)),
    enemyTeam: enemies.map((p) => specLabel(p.spec)),
    processedAt: new Date().toISOString(),
  };
}

function extractFeedbackSection(aiResponse: string): string {
  const marker = '## Prompt Feedback';
  const idx = aiResponse.indexOf(marker);
  return idx !== -1 ? aiResponse.slice(idx).trim() : '';
}

// ── Phase 1 ───────────────────────────────────────────────────────────────────

async function runPhase1(): Promise<void> {
  const files = (await fs.readdir(LOG_DIR))
    .filter((f) => f.endsWith('.txt') && f.startsWith('WoWCombatLog'))
    .map((f) => path.join(LOG_DIR, f))
    .sort();

  if (files.length === 0) {
    console.error(`No WoWCombatLog*.txt files found in ${LOG_DIR}`);
    process.exit(1);
  }

  const existing = new Set<string>();
  if (await fs.pathExists(RESULTS_FILE)) {
    const lines = (await fs.readFile(RESULTS_FILE, 'utf-8')).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const rec = JSON.parse(line) as BatchRecord;
        existing.add(`${rec.meta.logFile}::${rec.meta.matchIndex}`);
      } catch {
        /* skip malformed */
      }
    }
  }
  console.log(`Found ${files.length} log file(s). ${existing.size} match(es) already processed.\n`);

  await fs.ensureDir(OUTPUT_DIR);
  const outStream = fs.createWriteStream(RESULTS_FILE, { flags: 'a' });

  let total = 0;
  let skipped = 0;
  let failed = 0;

  for (const logPath of files) {
    const fileName = path.basename(logPath);
    let combats: ParsedCombat[];
    try {
      combats = await parseLogText(await fs.readFile(logPath, 'utf-8'));
    } catch (e) {
      console.error(`  ERROR parsing ${fileName}: ${e}`);
      failed++;
      continue;
    }

    for (let i = 0; i < combats.length; i++) {
      const key = `${fileName}::${i + 1}`;
      if (existing.has(key)) {
        skipped++;
        continue;
      }

      const combat = combats[i];
      const meta = extractMatchMeta(combat, logPath, i + 1);
      const prompt = buildMatchPrompt(combat);
      if (!prompt) continue;

      total++;
      console.log(
        `[${total}] ${fileName} match ${i + 1} — ${meta.spec} | ${meta.bracket} | ${meta.result} | ${meta.durationSeconds}s`,
      );

      let aiResponse = '[SKIPPED — no ANTHROPIC_API_KEY]';
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          process.stderr.write(`  Calling Claude...\n`);
          aiResponse = await callClaude(prompt, 'test');
        } catch (e) {
          aiResponse = `[AI call failed: ${e}]`;
          failed++;
        }
      }

      const record: BatchRecord = {
        meta,
        prompt,
        aiResponse,
        feedbackSection: extractFeedbackSection(aiResponse),
      };
      outStream.write(JSON.stringify(record) + '\n');
    }
  }

  await new Promise<void>((resolve, reject) => {
    outStream.on('error', reject);
    outStream.end(resolve);
  });
  console.log(`\nPhase 1 complete. Processed: ${total}  Skipped: ${skipped}  Failed: ${failed}`);
  console.log(`Results → ${RESULTS_FILE}`);
}

// ── Phase 2 placeholder (added in Task 3) ────────────────────────────────────

function buildMetaPrompt(records: BatchRecord[]): string {
  const wins = records.filter((r) => r.meta.result === 'Win').length;
  const losses = records.filter((r) => r.meta.result === 'Loss').length;
  const unknowns = records.filter((r) => r.meta.result === 'Unknown').length;

  const specCounts: Record<string, { wins: number; losses: number; total: number }> = {};
  const opponentCompCounts: Record<string, number> = {};
  const bracketCounts: Record<string, number> = {};

  for (const r of records) {
    const s = r.meta.spec;
    if (!specCounts[s]) specCounts[s] = { wins: 0, losses: 0, total: 0 };
    specCounts[s].total++;
    if (r.meta.result === 'Win') specCounts[s].wins++;
    if (r.meta.result === 'Loss') specCounts[s].losses++;

    const comp = [...r.meta.enemyTeam].sort().join(' + ');
    opponentCompCounts[comp] = (opponentCompCounts[comp] ?? 0) + 1;

    bracketCounts[r.meta.bracket] = (bracketCounts[r.meta.bracket] ?? 0) + 1;
  }

  const topComps = Object.entries(opponentCompCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([comp, n]) => `  ${n}x  ${comp}`)
    .join('\n');

  const specRows = Object.entries(specCounts)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([spec, c]) => `  ${spec}: ${c.total} games, ${c.wins}W/${c.losses}L`)
    .join('\n');

  const bracketRows = Object.entries(bracketCounts)
    .map(([b, n]) => `  ${b}: ${n} games`)
    .join('\n');

  const allFeedback = records
    .filter((r) => r.feedbackSection)
    .map((r, i) => `=== Match ${i + 1} (${r.meta.spec} | ${r.meta.result}) ===\n${r.feedbackSection}`)
    .join('\n\n');

  const durationStats = (() => {
    const d = records.map((r) => r.meta.durationSeconds).sort((a, b) => a - b);
    const median = d[Math.floor(d.length / 2)] ?? 0;
    const p90 = d[Math.floor(d.length * 0.9)] ?? 0;
    return `Median: ${median}s  P90: ${p90}s  Min: ${d[0] ?? 0}s  Max: ${d[d.length - 1] ?? 0}s`;
  })();

  const winRate = records.length > 0 ? Math.round((wins / records.length) * 100) : 0;

  return `You are a WoW arena coaching analyst. Below is aggregate data from ${records.length} arena matches played by a single player. Your job is to identify patterns across these games and evaluate prompt engineering quality.

## MATCH STATISTICS

Total: ${records.length} matches | Wins: ${wins} | Losses: ${losses} | Unknown: ${unknowns}
Win rate: ${winRate}%

### Spec breakdown (by log owner)
${specRows}

### Bracket breakdown
${bracketRows}

### Top opponent comps (sorted by frequency)
${topComps}

### Match duration distribution
${durationStats}

---

## PROMPT FEEDBACK (collected per match via Claude's self-evaluation)

${allFeedback || '[No feedback collected — run with ANTHROPIC_API_KEY to enable]'}

---

## YOUR TASK

Produce a structured summary report with exactly these four sections:

### 1. Game Patterns
Identify 3–5 recurring tactical patterns across this player's matches. For each pattern: what happens, how often it appears to occur, and which result (Win/Loss) it correlates with. Base this on the match metadata above — do not invent details not present in the data.

### 2. Prompt Quality Assessment
Based on the Prompt Feedback sections collected from Claude's self-evaluations, identify:
- The top 2–3 data gaps Claude repeatedly flagged as missing (e.g., "HP% at time of trade")
- The top 1–2 data sections Claude found least useful or redundant
- Any recurring ambiguity or contradiction Claude noticed in the structured data
Cite specific feedback quotes where possible.

### 3. Result Category Breakdown
Summarize win/loss patterns by: spec played, opponent comp, bracket, and match duration. Which situations correlate with wins? Which with losses? Be data-driven, not generic.

### 4. Top 3 Recommendations
Based on the above analysis, list 3 concrete, prioritized action items — one for improving gameplay decisions, one for improving the AI prompt/data pipeline, and one for improving match strategy against specific opponent patterns. Each recommendation: 2 sentences max.

Keep the full report under 600 words. Be specific and blunt — this is internal analysis, not player-facing coaching.`;
}

async function runPhase2(): Promise<void> {
  if (!(await fs.pathExists(RESULTS_FILE))) {
    console.error(`No results file found at ${RESULTS_FILE}. Run Phase 1 first.`);
    process.exit(1);
  }

  const lines = (await fs.readFile(RESULTS_FILE, 'utf-8')).split('\n').filter(Boolean);
  const records: BatchRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as BatchRecord);
    } catch {
      /* skip malformed */
    }
  }

  if (records.length === 0) {
    console.error('No valid records found in results.jsonl');
    process.exit(1);
  }

  console.log(`Phase 2: meta-analysis across ${records.length} matches\n`);

  const metaPrompt = buildMetaPrompt(records);
  console.log('--- META-ANALYSIS PROMPT ---\n');
  console.log(metaPrompt);
  console.log('\n--- END PROMPT ---\n');

  let summary = '[SKIPPED — no ANTHROPIC_API_KEY]';
  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    process.stderr.write('Calling Claude for meta-analysis...\n');
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      temperature: 0.2,
      system: 'You are a concise, data-driven WoW arena analyst. Respond only with the requested structured report.',
      messages: [{ role: 'user', content: metaPrompt }],
    });
    const content = message.content[0];
    summary = content?.type === 'text' ? content.text : '[Non-text response]';
  }

  const reportDate = new Date().toISOString().slice(0, 10);
  const fullSummary = `# Local Match Batch Analysis\n\nGenerated: ${reportDate}  |  Matches: ${records.length}\n\n---\n\n${summary}\n`;

  await fs.writeFile(SUMMARY_FILE, fullSummary, 'utf-8');
  console.log(summary);
  console.log(`\nSummary → ${SUMMARY_FILE}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const phase1Only = args.includes('--phase1-only');
  const phase2Only = args.includes('--phase2-only');

  if (!phase2Only) await runPhase1();
  if (!phase1Only) await runPhase2();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
