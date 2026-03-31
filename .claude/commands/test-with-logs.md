Guide the user on how to use test arena logs on macOS to develop and test different features of WoW Arena Logs.

## Overview

Test log files live at `packages/parser/test/testlogs/`. These are real WoW combat log text files you can use without running WoW itself.

## Available Test Logs

| File | What it covers |
|------|---------------|
| `3v3_tww_1120_reduced.txt` | Standard 3v3 arena match — best general-purpose test log |
| `hunter_priest_match.txt` | Advanced logging (mana/power tracking), good for healer POV tests |
| `one_solo_shuffle.txt` | Solo shuffle match |
| `shuffle_reloads.txt` | Shuffle with /reload events mid-match |
| `shuffle_early_leaver.txt` | Player leaves shuffle early |
| `two_matches.txt` | Multiple matches in one file — tests index selection |
| `no_advanced.txt` | No advanced combat logging — tests degraded path |
| `bg_blitz.txt` | Battleground Blitz mode |
| `double_start.txt` | Malformed/double-start edge case |
| `test_dedup.txt` | Deduplication edge cases |

---

## Testing by Feature

### 1. Parser — Unit Tests

Run the full parser test suite (no WoW or app needed):

```bash
npm run test
# or just the parser package:
cd packages/parser && npm test
```

Key test files:
- `packages/parser/test/3v3.test.ts` — 3v3 parsing
- `packages/parser/test/soloshuffle.test.ts` — solo shuffle logic
- `packages/parser/test/parser.test.ts` — core parser behavior

---

### 2. AI Cooldown Analysis — `scripts/testAnalyze.mjs`

The main tool for testing the full analysis pipeline against a raw log file.

**Usage:**

```bash
# Full analysis (requires ANTHROPIC_API_KEY)
node scripts/testAnalyze.mjs <log-path> [match-index]

# List all matches in a file without running analysis
node scripts/testAnalyze.mjs <log-path> --list

# Show the context sent to AI without calling the API (free — good for verifying scoring changes)
node scripts/testAnalyze.mjs <log-path> --dry-run
node scripts/testAnalyze.mjs <log-path> 2 --dry-run   # specific match index + dry run

# Auto-detect your real WoW log (no path needed)
node scripts/testAnalyze.mjs
```

**Match selection:** Without a match index, the script auto-picks the best match (prefers 3v3 over Solo Shuffle, then longest duration). Pass an integer index (0-based) to override.

**API key setup** — create `packages/web/.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
```
Or set it as an environment variable. Each full analysis call costs ~$0.01.

**When to use `--dry-run`:**
- After changing scoring logic (danger weights, burst window formula, dampening)
- After adding/removing spells from `spells.json` or `SPELL_EFFECT_OVERRIDES`
- To verify the context structure is correct before spending API credits

**Examples:**

```bash
# Check what matches are in the standard test log
node scripts/testAnalyze.mjs packages/parser/test/testlogs/3v3_tww_1120_reduced.txt --list

# Verify scoring output after changing spellDanger.ts
node scripts/testAnalyze.mjs packages/parser/test/testlogs/3v3_tww_1120_reduced.txt --dry-run

# Full AI analysis on the second match in a multi-match file
node scripts/testAnalyze.mjs packages/parser/test/testlogs/two_matches.txt 1

# Run against your real WoW log (auto-detected)
node scripts/testAnalyze.mjs
```

---

### 3. Web App — Combat Report UI

View CombatReport components (scoreboard, timeline, CC, death reports, replay, AI tab) in the browser.

**Start the dev server:**

```bash
npm run dev:web
# Opens http://localhost:3000
```

**Env setup** — create `packages/web/.env.local`:

```env
NEXTAUTH_SECRET=wowarenalogs_not_real_secret
BLIZZARD_CLIENT_ID=dummy
BLIZZARD_CLIENT_SECRET=dummy
ANTHROPIC_API_KEY=sk-ant-...   # required for AI Analysis tab
```

> Battle.net login won't work with dummy credentials. Browse as a guest or use a real Battle.net dev app for auth-gated features.

**Load a test log:** The web app accepts log uploads. Drag and drop any file from `packages/parser/test/testlogs/` through the UI.

---

### 4. Desktop App (Electron) — Live Log Watching

The desktop app watches WoW's real `WoWCombatLog.txt` in real-time.

**Start the desktop app:**

```bash
npm run dev:app
```

**Simulate log writing** — copy a test log to WoW's log path:

```bash
LOG_PATH="$HOME/Library/Application Support/World of Warcraft/_retail_/Logs/WoWCombatLog.txt"
cp packages/parser/test/testlogs/3v3_tww_1120_reduced.txt "$LOG_PATH"
```

The app's log watcher picks up the file and parses it automatically.

---

### 5. Spell Data & Scoring Utilities

The scoring pipeline is in three files:
- `packages/shared/src/utils/spellDanger.ts` — spell effect types, danger weights, `isOffensiveSpell()`
- `packages/shared/src/utils/enemyCDs.ts` — enemy CD timeline reconstruction, burst window scoring
- `packages/shared/src/utils/dampening.ts` — dampening estimate and multiplier

After changing any of these, use `--dry-run` to verify the ENEMY ALIGNED BURST WINDOWS section of the context output shows correct scores and labels.

**Checking which spells are classified as offensive:**

```bash
node -e "
const spells = JSON.parse(require('fs').readFileSync('packages/shared/src/data/spells.json'));
const effects = JSON.parse(require('fs').readFileSync('packages/shared/src/data/spellEffects.json'));
const offensive = Object.entries(spells)
  .filter(([,v]) => v.type === 'buffs_offensive' || v.type === 'debuffs_offensive')
  .filter(([,v]) => !v.nounitFrames && !v.nonameplates);
offensive.forEach(([id]) => {
  const e = effects[id];
  if (!e) return;
  const cd = e.cooldownSeconds ?? e.charges?.chargeCooldownSeconds ?? 0;
  if (cd >= 30 && cd <= 360) console.log(id, e.name, cd + 's');
});
"
```

---

### 6. Performance Testing

```bash
cd packages/parser
npm run perf:run          # Run performance benchmarks
npm run perf:update       # Update baseline snapshots
npm run perf:cpu-prof     # CPU profiling run
```

---

### 7. Claude Skills

Three slash commands are available in this repo:

| Command | What it does |
|---------|-------------|
| `/analyze-arena [path]` | Finds your WoW log, runs the full AI analysis, displays results |
| `/test-with-logs` | Shows this guide |
| `/update-wow-data` | Checks wago.tools for new spell data and updates `spellEffects.json` / `spellIdLists.json` |

---

## Quick Reference

| Goal | Command |
|------|---------|
| Run all tests | `npm run test` |
| Parser tests only | `cd packages/parser && npm test` |
| List matches in a log | `node scripts/testAnalyze.mjs <log> --list` |
| Inspect scoring without API call | `node scripts/testAnalyze.mjs <log> --dry-run` |
| Full AI analysis | `node scripts/testAnalyze.mjs <log>` |
| Start web UI | `npm run dev:web` |
| Start desktop app | `npm run dev:app` |
| Lint everything | `npm run lint` |
| Full build | `npm run build` |

## Tips

- Start with `3v3_tww_1120_reduced.txt` — it's the most complete modern log
- Use `--dry-run` when iterating on scoring changes — it's free and fast
- The `ANTHROPIC_API_KEY` env var is required for the AI Analysis tab and full script runs; each call costs ~$0.01
- Advanced combat logging must be enabled in WoW settings for full event detail; `no_advanced.txt` tests the degraded path
- The parser size limit is 200 KB — run `npm run build:parser` to verify after parser changes
