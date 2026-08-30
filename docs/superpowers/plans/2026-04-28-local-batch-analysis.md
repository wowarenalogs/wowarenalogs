# Local Batch Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `localBatchAnalysis.ts` script that processes every match from `~/Downloads/wow logs/`, calls Claude for AI analysis + prompt feedback on each, saves structured JSONL results, then produces a cross-match summary covering game patterns, prompt quality trends, and result category breakdown.

**Architecture:** Single new script in `packages/tools/src/` with two phases — Phase 1 processes each match individually (builds prompt → calls Claude with `test` mode → saves record to JSONL), Phase 2 reads all records and calls Claude once for a meta-analysis summary. Reuses `buildMatchPrompt` and `callClaude` by exporting them from `printMatchPrompts.ts`.

**Tech Stack:** TypeScript, `ts-node`, Anthropic SDK (already in `packages/tools`), `fs-extra`, `@wowarenalogs/parser`.

---

## File Map

| Action | File                                       | Responsibility                                                                          |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Modify | `packages/tools/src/printMatchPrompts.ts`  | Export `buildMatchPrompt`, `callClaude`, `parseLogText`, `ParsedCombat`, `specToString` |
| Create | `packages/tools/src/localBatchAnalysis.ts` | Full two-phase pipeline: per-match AI call → save JSONL → meta-analysis summary         |
| Modify | `packages/tools/package.json`              | Add `start:localBatchAnalysis` npm script                                               |
| Create | `packages/tools/local-batch/.gitignore`    | Gitignore `results.jsonl` and `summary.md` (generated output)                           |

---

## Task 1: Export shared helpers from `printMatchPrompts.ts`

**Files:**

- Modify: `packages/tools/src/printMatchPrompts.ts`

- [ ] **Step 1: Add `export` keyword to `buildMatchPrompt`, `callClaude`, `parseLogText`, and the `ParsedCombat` type alias**

Find these four declarations in `printMatchPrompts.ts` and add `export` to each:

```typescript
// Line ~245 — add export:
export async function parseLogText(text: string): Promise<ParsedCombat[]> {

// Line ~261 — add export:
export async function callClaude(

// Line ~391 — add export:
export function buildMatchPrompt(combat: ParsedCombat, forceHealer = false): string {
```

Also export the `ParsedCombat` type near the top where it's defined (around line 228):

```typescript
export type ParsedCombat = IArenaMatch | IShuffleRound;
```

And export `specToString` (search for its definition, it's a short helper that converts `CombatUnitSpec` to a string label):

```typescript
export function specToString(spec: string | number): string {
```

- [ ] **Step 2: Verify no TypeScript errors introduced**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npx tsc -p packages/tools/tsconfig.json --noEmit 2>&1 | head -30
```

Expected: no new errors (existing errors, if any, are pre-existing — only new ones matter).

- [ ] **Step 3: Commit**

```bash
git add packages/tools/src/printMatchPrompts.ts
git commit -m "feat(tools): export buildMatchPrompt, callClaude, parseLogText for reuse"
```

---

## Task 2: Create `localBatchAnalysis.ts` — Phase 1 (per-match batch)

**Files:**

- Create: `packages/tools/src/localBatchAnalysis.ts`

- [ ] **Step 1: Write the file skeleton with types and imports**

Create `packages/tools/src/localBatchAnalysis.ts`:

```typescript
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

import { buildMatchPrompt, callClaude, parseLogText, ParsedCombat } from './printMatchPrompts';
import { TEST_SYSTEM_PROMPT } from '../../shared/src/prompts/analyzeSystemPrompts';

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
  feedbackSection: string; // extracted "## Prompt Feedback" block from aiResponse
}
```

- [ ] **Step 2: Write `extractMatchMeta` helper**

Append to `localBatchAnalysis.ts`:

```typescript
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

  // Pick log owner: prefer non-healer DPS
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
```

- [ ] **Step 3: Write `runPhase1` function**

Append to `localBatchAnalysis.ts`:

```typescript
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

  // Load existing results to skip already-processed matches
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

  outStream.end();
  console.log(`\nPhase 1 complete. Processed: ${total}  Skipped: ${skipped}  Failed: ${failed}`);
  console.log(`Results → ${RESULTS_FILE}`);
}
```

- [ ] **Step 4: Verify TypeScript compiles (no AI call yet)**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npx tsc -p packages/tools/tsconfig.json --noEmit 2>&1 | grep "localBatchAnalysis"
```

Expected: no errors referencing `localBatchAnalysis.ts`.

- [ ] **Step 5: Commit Phase 1 implementation**

```bash
git add packages/tools/src/localBatchAnalysis.ts
git commit -m "feat(tools): add localBatchAnalysis phase 1 — per-match AI call + JSONL save"
```

---

## Task 3: Add `runPhase2` — meta-analysis summary

**Files:**

- Modify: `packages/tools/src/localBatchAnalysis.ts`

- [ ] **Step 1: Write the meta-analysis prompt builder**

Append to `localBatchAnalysis.ts` before `main()`:

```typescript
// ── Phase 2 ───────────────────────────────────────────────────────────────────

function buildMetaPrompt(records: BatchRecord[]): string {
  const wins = records.filter((r) => r.meta.result === 'Win').length;
  const losses = records.filter((r) => r.meta.result === 'Loss').length;
  const unknowns = records.filter((r) => r.meta.result === 'Unknown').length;

  // Frequency counts
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

  return `You are a WoW arena coaching analyst. Below is aggregate data from ${records.length} arena matches played by a single player. Your job is to identify patterns across these games and evaluate prompt engineering quality.

## MATCH STATISTICS

Total: ${records.length} matches | Wins: ${wins} | Losses: ${losses} | Unknown: ${unknowns}
Win rate: ${records.length > 0 ? Math.round((wins / records.length) * 100) : 0}%

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
```

- [ ] **Step 2: Write `runPhase2` function**

Append after `buildMetaPrompt`:

```typescript
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
    summary = content.type === 'text' ? content.text : '[Non-text response]';
  }

  const reportDate = new Date().toISOString().slice(0, 10);
  const fullSummary = `# Local Match Batch Analysis\n\nGenerated: ${reportDate}  |  Matches: ${records.length}\n\n---\n\n${summary}\n`;

  await fs.writeFile(SUMMARY_FILE, fullSummary, 'utf-8');
  console.log(summary);
  console.log(`\nSummary → ${SUMMARY_FILE}`);
}
```

- [ ] **Step 3: Write `main()` entry point**

Append to `localBatchAnalysis.ts`:

```typescript
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
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npx tsc -p packages/tools/tsconfig.json --noEmit 2>&1 | grep "localBatchAnalysis"
```

Expected: no errors.

- [ ] **Step 5: Commit Phase 2**

```bash
git add packages/tools/src/localBatchAnalysis.ts
git commit -m "feat(tools): add localBatchAnalysis phase 2 — meta-analysis summary across all matches"
```

---

## Task 4: Add npm script and gitignore

**Files:**

- Modify: `packages/tools/package.json`
- Create: `packages/tools/local-batch/.gitignore`

- [ ] **Step 1: Add npm script to `packages/tools/package.json`**

In the `"scripts"` block, add after `start:printMatchPrompts`:

```json
"start:localBatchAnalysis": "dotenv -- ts-node --files ./src/localBatchAnalysis.ts"
```

(Uses `dotenv --` so that a `.env` file in the repo root is automatically loaded, picking up `ANTHROPIC_API_KEY` the same way other tools do.)

- [ ] **Step 2: Create gitignore for generated output**

Create `packages/tools/local-batch/.gitignore`:

```
results.jsonl
summary.md
```

- [ ] **Step 3: Verify the script is runnable (dry run — no API key needed)**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run -w @wowarenalogs/tools start:localBatchAnalysis -- --phase1-only 2>&1 | head -20
```

Expected: prints log file count, processes matches, writes `packages/tools/local-batch/results.jsonl` with `[SKIPPED — no ANTHROPIC_API_KEY]` for AI responses (since no key set).

- [ ] **Step 4: Commit**

```bash
git add packages/tools/package.json packages/tools/local-batch/.gitignore
git commit -m "feat(tools): add start:localBatchAnalysis npm script and gitignore for generated output"
```

---

## Task 5: Smoke test with real API key

**Files:** none (verification only)

- [ ] **Step 1: Run Phase 1 against the 12 local log files**

```bash
cd /Users/mingjianliu/code/wowarenalogs
ANTHROPIC_API_KEY=<your-key> npm run -w @wowarenalogs/tools start:localBatchAnalysis -- --phase1-only 2>&1 | tee /tmp/phase1.log
```

Expected output pattern:

```
Found 12 log file(s). 0 match(es) already processed.

[1] WoWCombatLog-040726_192656.txt match 1 — <Spec> | <Bracket> | Win/Loss | 180s
  Calling Claude...
[2] ...
...
Phase 1 complete. Processed: N  Skipped: 0  Failed: 0
Results → packages/tools/local-batch/results.jsonl
```

- [ ] **Step 2: Verify `results.jsonl` has one JSON record per line**

```bash
wc -l /Users/mingjianliu/code/wowarenalogs/packages/tools/local-batch/results.jsonl
head -c 500 /Users/mingjianliu/code/wowarenalogs/packages/tools/local-batch/results.jsonl
```

Expected: N lines (one per match), each parseable JSON with keys `meta`, `prompt`, `aiResponse`, `feedbackSection`.

- [ ] **Step 3: Run Phase 2 to generate summary**

```bash
cd /Users/mingjianliu/code/wowarenalogs
ANTHROPIC_API_KEY=<your-key> npm run -w @wowarenalogs/tools start:localBatchAnalysis -- --phase2-only 2>&1
```

Expected: prints meta-analysis prompt, then structured summary with 4 sections (Game Patterns, Prompt Quality Assessment, Result Category Breakdown, Top 3 Recommendations). Summary saved to `packages/tools/local-batch/summary.md`.

- [ ] **Step 4: Verify idempotency — re-run Phase 1 skips already-processed matches**

```bash
cd /Users/mingjianliu/code/wowarenalogs
ANTHROPIC_API_KEY=<your-key> npm run -w @wowarenalogs/tools start:localBatchAnalysis -- --phase1-only 2>&1 | grep "already processed"
```

Expected: `Found 12 log file(s). N match(es) already processed.` with no new Claude calls.

---

## Self-Review Checklist

- [x] **Spec coverage**: Both user requirements covered — Phase 1 = "compute every game prompt + collect feedback", Phase 2 = "summarize game pattern, prompt, result category".
- [x] **No placeholders**: All code blocks are complete and runnable.
- [x] **Type consistency**: `BatchRecord`, `MatchMeta`, `ParsedCombat` used consistently across all tasks. `specLabel` helper used only in `localBatchAnalysis.ts` (not re-exported from `printMatchPrompts.ts` to avoid confusion with existing `specToString`).
- [x] **Export correctness**: Task 1 exports exactly what Task 2 imports (`buildMatchPrompt`, `callClaude`, `parseLogText`, `ParsedCombat`). `TEST_SYSTEM_PROMPT` is imported from `analyzeSystemPrompts.ts` directly (already exported).
- [x] **Idempotency**: Phase 1 tracks processed matches by `fileName::matchIndex` key, appends to JSONL, skips re-processing.
- [x] **gitignore**: `results.jsonl` and `summary.md` are gitignored so generated output never gets committed.
- [x] **npm script uses `dotenv --`**: Consistent with existing `start:simlog` pattern for API key loading.

> **Note on `TEST_SYSTEM_PROMPT`**: The import `import { TEST_SYSTEM_PROMPT } from '../../shared/src/prompts/analyzeSystemPrompts'` is only needed if you build a custom system prompt locally. The `callClaude(prompt, 'test')` call in Phase 1 already uses `TEST_SYSTEM_PROMPT` internally inside `printMatchPrompts.ts` — no separate import is needed in `localBatchAnalysis.ts`. Remove that import line from Task 2 Step 1 before implementing.
