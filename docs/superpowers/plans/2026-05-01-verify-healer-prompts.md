# Verify Healer Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Phase 1 corpus-builder script and a Phase 2 review skill so 100 healer-perspective AI prompts can be generated from production matches and reviewed one-by-one by Claude Code.

**Architecture:** A new ts-node script (`buildHealerPromptCorpus.ts`) reuses helpers from `printMatchPrompts.ts` to page GraphQL `latestMatches`, filter to combats where `combat.playerId` is a healer spec, build the live `--new-prompt` text, and write per-match files plus an `index.json`. A new slash-command markdown (`.claude/commands/verify-healer-prompts.md`) instructs Claude Code to walk that index and append findings to `issues.md`.

**Tech Stack:** ts-node, `@wowarenalogs/parser`, `node-fetch`, `fs-extra`, existing utility modules under `packages/shared/src/utils` and `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils`.

**Note on testing:** `packages/tools/` has no test infrastructure today. Verification for script tasks is manual (small-N runs) per task. The skill markdown is verified by reading the file and checking instructions are runnable.

---

## File Structure

| Path                                            | Action             | Responsibility                                                                                 |
| ----------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| `packages/tools/src/printMatchPrompts.ts`       | Modify             | Export `fetchStubs` and `buildMatchPromptNew` so they can be reused without duplicating logic. |
| `packages/tools/src/buildHealerPromptCorpus.ts` | Create             | Phase 1 script: page GraphQL, filter healers, build prompts, write files + `index.json`.       |
| `packages/tools/package.json`                   | Modify             | Register `start:buildHealerPromptCorpus` script.                                               |
| `.claude/commands/verify-healer-prompts.md`     | Create             | Phase 2 skill: review rubric + iteration protocol + resume rules.                              |
| `packages/tools/local-batch/healer-review/`     | Created at runtime | Output dir; gitignored via existing `local-batch/` pattern.                                    |

---

### Task 1: Export reusable helpers from `printMatchPrompts.ts`

**Files:**

- Modify: `packages/tools/src/printMatchPrompts.ts:229` (add `export` to `fetchStubs`)
- Modify: `packages/tools/src/printMatchPrompts.ts:857` (add `export` to `buildMatchPromptNew`)
- Modify: `packages/tools/src/printMatchPrompts.ts:221` (add `export` to `MatchStub` interface so external callers can type the return)

- [ ] **Step 1: Export `MatchStub` interface**

Change line 221 from:

```ts
interface MatchStub {
```

to:

```ts
export interface MatchStub {
```

- [ ] **Step 2: Export `fetchStubs`**

Change line 229 from:

```ts
async function fetchStubs(bracket: string, count: number): Promise<MatchStub[]> {
```

to:

```ts
export async function fetchStubs(bracket: string, count: number, offset = 0): Promise<MatchStub[]> {
```

Update the body (line 233) to pass `offset` through to the GraphQL variables:

```ts
    body: JSON.stringify({ query: STUBS_QUERY, variables: { wowVersion: 'retail', bracket, offset, count } }),
```

This makes the function paginatable. Existing callers in the same file pass two args; they remain valid because `offset` defaults to 0.

- [ ] **Step 3: Export `buildMatchPromptNew`**

Change line 857 from:

```ts
function buildMatchPromptNew(combat: ParsedCombat, forceHealer = false): string {
```

to:

```ts
export function buildMatchPromptNew(combat: ParsedCombat, forceHealer = false): string {
```

- [ ] **Step 4: Verify the file still type-checks and the existing CLI still runs**

Run:

```bash
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 1 --new-prompt
```

Expected: prints one match prompt to stdout (requires network access to `wowarenalogs.com`). If the user is offline, instead run a TypeScript check:

```bash
npx tsc --noEmit -p packages/tools/tsconfig.json
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/printMatchPrompts.ts
git commit -m "refactor(tools): export fetchStubs, buildMatchPromptNew, MatchStub for reuse"
```

---

### Task 2: Create the corpus-builder script (skeleton + GraphQL pagination)

**Files:**

- Create: `packages/tools/src/buildHealerPromptCorpus.ts`

- [ ] **Step 1: Write the skeleton with config + types + main loop scaffold**

Create `packages/tools/src/buildHealerPromptCorpus.ts`:

```ts
/* eslint-disable no-console */
/**
 * buildHealerPromptCorpus.ts
 *
 * Phase 1 of the verify-healer-prompts skill.
 *
 * Pages the public GraphQL `latestMatches` feed (3v3, retail) and writes the
 * AI prompt for each combat where `combat.playerId` is a healer spec, until
 * we have TARGET_COUNT files. Output:
 *
 *   packages/tools/local-batch/healer-review/
 *     prompts/<NNN>-<spec>-<W|L>-<matchId>.txt
 *     index.json
 *
 * No AI calls. Phase 2 (review) is a separate slash command.
 *
 * Usage:
 *   npm run -w @wowarenalogs/tools start:buildHealerPromptCorpus
 *   TARGET_COUNT=10 npm run -w @wowarenalogs/tools start:buildHealerPromptCorpus
 */

import { CombatUnitReaction, CombatUnitType, IArenaMatch, ICombatUnit, IShuffleRound } from '@wowarenalogs/parser';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

import { isHealerSpec, specToString } from '../../shared/src/utils/cooldowns';
import { buildMatchPromptNew, fetchStubs, MatchStub, ParsedCombat, parseLogText } from './printMatchPrompts';

const TARGET_COUNT = Number(process.env.TARGET_COUNT ?? 100);
const PAGE_SIZE = Number(process.env.PAGE_SIZE ?? 50);
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 20); // safety stop: 20 * 50 = 1000 candidates
const BRACKET = process.env.BRACKET ?? '3v3';

const OUTPUT_DIR = path.join(__dirname, '../local-batch/healer-review');
const PROMPTS_DIR = path.join(OUTPUT_DIR, 'prompts');
const INDEX_FILE = path.join(OUTPUT_DIR, 'index.json');

interface IndexEntry {
  ordinal: number;
  file: string;
  matchId: string;
  spec: string;
  bracket: string;
  result: 'Win' | 'Loss' | 'Unknown';
  durationSec: number;
}

function sanitizeForFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9-]/g, '');
}

async function main() {
  await fs.ensureDir(PROMPTS_DIR);
  console.log(`Target: ${TARGET_COUNT} healer prompts at bracket=${BRACKET}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  const entries: IndexEntry[] = [];
  const seenMatchIds = new Set<string>();
  let page = 0;

  while (entries.length < TARGET_COUNT && page < MAX_PAGES) {
    const offset = page * PAGE_SIZE;
    console.log(`Fetching stubs page ${page + 1} (offset=${offset}, count=${PAGE_SIZE})...`);
    let stubs: MatchStub[];
    try {
      stubs = await fetchStubs(BRACKET, PAGE_SIZE, offset);
    } catch (e) {
      console.error(`  Stub fetch failed: ${e}`);
      break;
    }
    if (stubs.length === 0) {
      console.log('  No more stubs returned. Stopping.');
      break;
    }

    for (const stub of stubs) {
      if (entries.length >= TARGET_COUNT) break;
      if (seenMatchIds.has(stub.id)) continue;
      seenMatchIds.add(stub.id);
      const entry = await tryProcessStub(stub, entries.length + 1);
      if (entry) entries.push(entry);
    }

    page++;
  }

  await fs.writeJson(INDEX_FILE, entries, { spaces: 2 });

  console.log(`\nWrote ${entries.length} prompt(s) to ${PROMPTS_DIR}`);
  console.log(`Index: ${INDEX_FILE}`);
  if (entries.length < TARGET_COUNT) {
    console.warn(`WARNING: only ${entries.length}/${TARGET_COUNT} healer matches found after ${page} page(s).`);
  }
}

// Stubbed in Task 3 — placeholder so the file compiles.
async function tryProcessStub(_stub: MatchStub, _ordinal: number): Promise<IndexEntry | null> {
  return null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it compiles**

Run:

```bash
npx tsc --noEmit -p packages/tools/tsconfig.json
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/tools/src/buildHealerPromptCorpus.ts
git commit -m "feat(tools): scaffold buildHealerPromptCorpus pagination loop"
```

---

### Task 3: Implement `tryProcessStub` — download, parse, healer filter, write files

**Files:**

- Modify: `packages/tools/src/buildHealerPromptCorpus.ts` (replace `tryProcessStub` stub)

- [ ] **Step 1: Replace the stub `tryProcessStub` with the full implementation**

Replace the body of `tryProcessStub` with:

```ts
async function tryProcessStub(stub: MatchStub, ordinal: number): Promise<IndexEntry | null> {
  const date = new Date(stub.startTime).toISOString().slice(0, 10);
  process.stderr.write(`  [${ordinal}] ${stub.id} (${stub.startInfo?.bracket ?? BRACKET}, ${date})... `);

  let text: string;
  try {
    const res = await fetch(stub.logObjectUrl);
    if (!res.ok) {
      process.stderr.write(`download failed (${res.status})\n`);
      return null;
    }
    text = await res.text();
  } catch (e) {
    process.stderr.write(`download error: ${e}\n`);
    return null;
  }

  let combats: ParsedCombat[];
  try {
    combats = await parseLogText(text);
  } catch (e) {
    process.stderr.write(`parse error: ${e}\n`);
    return null;
  }

  // Pick the first combat where the recording player (combat.playerId) is a healer.
  for (const combat of combats) {
    const friends = (Object.values(combat.units) as ICombatUnit[]).filter(
      (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Friendly,
    );
    const owner = friends.find((p) => p.id === combat.playerId);
    if (!owner) continue;
    if (!isHealerSpec(owner.spec)) continue;

    const spec = specToString(owner.spec);
    const durationSec = Math.round((combat.endTime - combat.startTime) / 1000);
    if (durationSec < 10) continue;

    const combatAny = combat as unknown as Record<string, unknown>;
    const playerWon =
      typeof combatAny['winningTeamId'] === 'string' ? combatAny['winningTeamId'] === combat.playerTeamId : null;
    const result: IndexEntry['result'] = playerWon === true ? 'Win' : playerWon === false ? 'Loss' : 'Unknown';
    const resultLetter = result === 'Win' ? 'W' : result === 'Loss' ? 'L' : 'U';

    // Build the live --new-prompt text. forceHealer=true is harmless here because
    // we already know the owner is a healer; it just keeps owner-selection consistent
    // with how the production CombatAIAnalysis component selects a healer perspective.
    const prompt = buildMatchPromptNew(combat, true);
    if (!prompt) {
      process.stderr.write(`empty prompt\n`);
      return null;
    }

    const ordinalStr = String(ordinal).padStart(3, '0');
    const filename = `${ordinalStr}-${sanitizeForFilename(spec)}-${resultLetter}-${sanitizeForFilename(stub.id)}.txt`;
    const filePath = path.join(PROMPTS_DIR, filename);
    await fs.writeFile(filePath, prompt, 'utf8');

    process.stderr.write(`wrote ${filename}\n`);
    return {
      ordinal,
      file: path.join('prompts', filename),
      matchId: stub.id,
      spec,
      bracket: combat.startInfo?.bracket ?? BRACKET,
      result,
      durationSec,
    };
  }

  process.stderr.write(`no healer perspective\n`);
  return null;
}
```

- [ ] **Step 2: Verify it type-checks**

Run:

```bash
npx tsc --noEmit -p packages/tools/tsconfig.json
```

Expected: exits 0.

- [ ] **Step 3: Smoke test with a small target**

Run:

```bash
TARGET_COUNT=3 npm run -w @wowarenalogs/tools start:buildHealerPromptCorpus
```

Expected:

- Logs three healer matches downloaded.
- `packages/tools/local-batch/healer-review/prompts/` contains 3 `.txt` files.
- `packages/tools/local-batch/healer-review/index.json` exists with 3 entries.
- Each prompt file begins with `ARENA MATCH — ANALYSIS REQUEST` (the same header `buildMatchPromptNew` produces).

If TARGET_COUNT=3 yields fewer than 3 files because most recent matches have non-healer recording players, increase `MAX_PAGES`:

```bash
TARGET_COUNT=3 MAX_PAGES=5 npm run -w @wowarenalogs/tools start:buildHealerPromptCorpus
```

- [ ] **Step 4: Verify a generated file's structure manually**

Read one generated file, e.g.:

```bash
head -10 packages/tools/local-batch/healer-review/prompts/001-*.txt
```

Expected: starts with `ARENA MATCH — ANALYSIS REQUEST` and includes `MATCH FACTS`, `Spec: <healer spec> (Healer)`.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/buildHealerPromptCorpus.ts
git commit -m "feat(tools): implement healer match download + prompt write"
```

---

### Task 4: Register `start:buildHealerPromptCorpus` npm script

**Files:**

- Modify: `packages/tools/package.json`

- [ ] **Step 1: Add the script entry**

Open `packages/tools/package.json`. In the `"scripts"` block (currently around line 7–20) add a new line after `start:printMatchPrompts`:

```json
"start:printMatchPrompts": "ts-node --files ./src/printMatchPrompts.ts",
"start:buildHealerPromptCorpus": "ts-node --files ./src/buildHealerPromptCorpus.ts",
"start:localBatchAnalysis": "dotenv -- ts-node --files ./src/localBatchAnalysis.ts"
```

(The exact preceding/following lines may vary; the point is to insert one line registering the new script next to its siblings.)

- [ ] **Step 2: Verify the script is invokable**

Run:

```bash
npm run -w @wowarenalogs/tools start:buildHealerPromptCorpus -- --help 2>&1 | head -5 || true
```

Expected: the script starts (does not error with "command not found"). It will attempt to fetch stubs immediately because there's no `--help` flag — that's fine; ctrl-C is acceptable here, we're only verifying npm-script registration. To avoid the network call, run instead:

```bash
TARGET_COUNT=0 MAX_PAGES=0 npm run -w @wowarenalogs/tools start:buildHealerPromptCorpus
```

Expected: prints the "Target: 0 healer prompts" header, then exits cleanly with `Wrote 0 prompt(s)`.

- [ ] **Step 3: Commit**

```bash
git add packages/tools/package.json
git commit -m "chore(tools): register start:buildHealerPromptCorpus npm script"
```

---

### Task 5: Write the `verify-healer-prompts` slash command

**Files:**

- Create: `.claude/commands/verify-healer-prompts.md`

- [ ] **Step 1: Create the slash command file**

Create `.claude/commands/verify-healer-prompts.md` with the following content:

```markdown
Build a corpus of 100 healer-perspective AI prompts and review each one for prompt-engineering quality, missing features, and bugs.

This is a **prompt review tool**, not a player-feedback tool. The target of review is the **prompt text we send to Claude**, not the player's gameplay.

## Phase 1 — Build the corpus (one shot)

Run:
```

npm run -w @wowarenalogs/tools start:buildHealerPromptCorpus

```

This pages production GraphQL `latestMatches` (3v3) until 100 matches where `combat.playerId` is a healer spec are written to:

```

packages/tools/local-batch/healer-review/
prompts/<NNN>-<spec>-<W|L>-<matchId>.txt # 100 files
index.json # iteration manifest

```

No AI is called in Phase 1. To shrink the corpus for development, set `TARGET_COUNT=10`. To page deeper if healers are sparse in the recent feed, raise `MAX_PAGES` (default 20).

## Phase 2 — Review (this Claude Code session)

For each entry in `index.json`, in order:

1. Determine the next ordinal to review:
   - Read `packages/tools/local-batch/healer-review/issues.md` if it exists.
   - Find the highest `## NNN` heading already present.
   - Resume from the next ordinal. If `issues.md` does not exist, start at 001.
2. Read the prompt file referenced by that index entry.
3. Evaluate it against the rubric below.
4. Append a section to `issues.md`:

```

## NNN — <spec> <Win|Loss> (<matchId>)

- <issue>: <short description with prompt-section/line reference>
- <issue>: ...
- (or write "no issues" on its own bullet)

```
5. Repeat until either the index is exhausted or the context window is filling. If stopping early, leave `issues.md` consistent (do not write a partial section) and report which ordinal completed last so the next session resumes cleanly.

## Review rubric

Apply all three categories to every prompt. The skill output is a flat findings list — the user does the synthesis (quality / missing / bugs grouping) themselves.

**Quality**
- Is each section in the prompt focused and non-redundant?
- Are numeric facts unambiguous (units, time origin, signs)?
- Is causal context (death traces, pressure windows, dampening) actually load-bearing for analysis, or vestigial filler?
- Is the structure consistent with `AI_FEATURES.md` ("Context Structure")?

**Missing features**
- What would a top-0.5%-rated healer want surfaced that is absent?
- Cross-reference: CC chains, dispel context, dampening, panic defensives, enemy CD timeline, outgoing CC chains, purge responsibility, healing gaps, offensive windows. If any of these is silently missing for a match where it would matter, flag it.

**Potential bugs**
- `undefined` / `NaN` / empty section bodies.
- Internally inconsistent timestamps (e.g., death listed before its contributing damage).
- Contradictions between sections (e.g., HP says alive at T, death log says died at T-1).
- Malformed structure: missing headers, duplicate sections, truncated output.
- Off-by-one indicators: HP ticks that don't line up with combat events, CD usage logged outside match window.

## Files produced

- `packages/tools/local-batch/healer-review/prompts/<NNN>-<spec>-<W|L>-<matchId>.txt` — Phase 1
- `packages/tools/local-batch/healer-review/index.json` — Phase 1
- `packages/tools/local-batch/healer-review/issues.md` — Phase 2, appended

## Notes

- Use this command's Phase 2 step exclusively in Claude Code. Do not invoke the Anthropic API for review — per the user's standing preference, prompt evaluation is done in this session.
- The prompt path used is `buildMatchPromptNew` from `printMatchPrompts.ts` — the same `--new-prompt` text production analysis uses. If production switches builders, update Phase 1.
```

- [ ] **Step 2: Verify the slash command file is recognized**

The user can run `/verify-healer-prompts` to see the command. From a terminal, just confirm the file exists:

```bash
ls -la /Users/mingjianliu/code/wowarenalogs/.claude/commands/verify-healer-prompts.md
```

Expected: file exists, size > 0.

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/verify-healer-prompts.md
git commit -m "feat(skills): add verify-healer-prompts slash command"
```

---

### Task 6: End-to-end smoke test on a small corpus

**Files:** none modified — exercise the system.

- [ ] **Step 1: Build a 5-match corpus**

```bash
TARGET_COUNT=5 npm run -w @wowarenalogs/tools start:buildHealerPromptCorpus
```

Expected:

- 5 files in `packages/tools/local-batch/healer-review/prompts/`.
- `index.json` has 5 entries with healer specs (RestoDruid / RestoShaman / HolyPriest / DiscPriest / HolyPaladin / MistweaverMonk / PreservationEvoker).
- No errors.

- [ ] **Step 2: Manually exercise Phase 2 on entry 001**

Read `index.json`, then read the file for ordinal 001, then write a single section to `packages/tools/local-batch/healer-review/issues.md`:

```
## 001 — <spec> <result> (<matchId>)
- <one issue or "no issues">
```

Verify the file is well-formed by re-reading it.

- [ ] **Step 3: Verify the resume rule by re-running mentally**

If `issues.md` already has `## 001`, the next review pass starts at ordinal 002. Confirm by inspection — there is no automated check; the slash-command markdown is the contract.

- [ ] **Step 4: Cleanup the smoke-test artifacts (optional)**

The output directory is under `packages/tools/local-batch/`, which matches the existing pattern used by `localBatchAnalysis.ts` and is gitignored. No cleanup required for source control. If the user wants to start clean before the real 100-match run:

```bash
rm -rf packages/tools/local-batch/healer-review
```

- [ ] **Step 5: No commit** — this task only verifies behavior; outputs under `local-batch/` are not committed.

---

## Done criteria

- `npm run -w @wowarenalogs/tools start:buildHealerPromptCorpus` produces N=TARGET_COUNT healer-perspective prompt files plus `index.json`.
- `/verify-healer-prompts` slash command appears in Claude Code, and following its Phase 2 instructions in this session produces a well-formed `issues.md` that can be resumed across context resets.
- No regressions in `start:printMatchPrompts` (still produces the same output it did before Task 1).
