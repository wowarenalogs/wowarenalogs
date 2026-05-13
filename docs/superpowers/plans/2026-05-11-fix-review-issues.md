# Fix Code-Review Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 7 issues surfaced by the code review of the AI-analysis bug-fix branch, then merge to main.

**Architecture:** All changes are isolated to `packages/shared/src/` (utils.ts, dispelAnalysis.ts, ccTrinketAnalysis.ts) and the test file; plus one git-housekeeping step to remove accidentally-committed PII files.

**Tech Stack:** TypeScript strict, Jest (via tsdx), git

---

## File Map

| File                                                                                      | Change                                                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Fix B13 blocklist, B39 early return, B15 anchor logic, remove duplicate comment |
| `packages/shared/src/utils/dispelAnalysis.ts`                                             | Fix removedSpellName localization gap                                           |
| `packages/shared/src/utils/ccTrinketAnalysis.ts`                                          | Fix kickSpellName localization gap                                              |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Update 3 stale `[CD EXPIRED]` assertions to `[BUFF FADED]`                      |
| `packages/tools/.gitignore` (create)                                                      | Ignore \*.txt output files                                                      |

---

## Task 1: Fix B31 — update stale `[CD EXPIRED]` test assertions

Three test assertions still use the old label. The code now emits `[BUFF FADED]`.

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` (lines ~2427, ~2457, ~2486)

- [ ] **Step 1: Find all `[CD EXPIRED]` in the test file**

```bash
grep -n "CD EXPIRED" packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
```

- [ ] **Step 2: Replace all three occurrences with `[BUFF FADED]`**

Use search-and-replace: every `[CD EXPIRED]` in the test file → `[BUFF FADED]`.

- [ ] **Step 3: Run targeted tests to verify B31 passes**

```bash
npm run -w @wowarenalogs/shared test -- --testNamePattern="CD EXPIRED" 2>&1 | tail -20
```

Expected: the three tests now pass (they look for `[BUFF FADED]` which the code emits).

---

## Task 2: Fix B39 — remove premature early return in `buildResourceSnapshot`

The early return at line ~1363 fires before `enemyActiveParts` and `ccParts` are computed, suppressing `[RES]` lines that should carry enemy/CC context.

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` (line ~1363)

- [ ] **Step 1: Remove the B39 early return line**

Delete exactly this line (the comprehensive guard at line ~1443 already handles this correctly):

```ts
if (parts.length === 0 && onCDParts.length === 0) return '';
```

- [ ] **Step 2: Run targeted test**

```bash
npm run -w @wowarenalogs/shared test -- --testNamePattern="emits rdy:Δ when ready list is unchanged" 2>&1 | tail -20
```

Expected: PASS. The test calls `buildResourceSnapshot` with `prevReadyNames=['Avenging Wrath']` and current ready=['Avenging Wrath']. `parts=[]`, `onCDParts=[]`, but `readyNames=['Avenging Wrath']` so the final guard at line 1443 does NOT fire → `rdy:Δ` is emitted.

---

## Task 3: Fix B15/F62/F64 — anchor tick logic in HP deduplication

Current anchor is `t % 5 === 0`, which doesn't align with the 3s baseline tick interval. This causes:

- Outside critical windows: t=0 reads same HP as t=3 (both within the 3s sample window), t=3 gets deduplicated even though it's a baseline tick.
- Inside critical windows: identical consecutive 1s readings get suppressed even though dense ticks should always appear.

Fix: always emit in critical windows; use `t % 3 === 0` as anchor outside.

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` (lines ~2135–2139)

- [ ] **Step 1: Replace the anchor tick logic**

Old code (lines ~2135–2139):

```ts
// B15: deduplicate — suppress tick if HP readings are identical to previous AND
// this is not a 5-second anchor tick (anchors always emit for timeline sanity).
const currentHpKey = `${friendlyParts.join('|')}||${enemyParts.join('|')}`;
const isAnchorTick = t % 5 === 0;
if (currentHpKey === prevHpKey && !isAnchorTick) continue;
```

New code:

```ts
// B15: deduplicate — suppress tick if HP readings are identical to previous AND
// this is not an anchor. In critical windows always emit (1s dense ticks are the point);
// outside critical windows use the 3s baseline interval as the anchor.
const currentHpKey = `${friendlyParts.join('|')}||${enemyParts.join('|')}`;
const isInCritical = criticalWindowSet.has(t);
const isAnchorTick = isInCritical || t % 3 === 0;
if (currentHpKey === prevHpKey && !isAnchorTick) continue;
```

- [ ] **Step 2: Run F62/F64 tests**

```bash
npm run -w @wowarenalogs/shared test -- --testNamePattern="F62|F64|dense HP" 2>&1 | tail -30
```

Expected: all 5 previously-failing tests now pass.

---

## Task 4: Fix B13 — passive spell blocklist dead code

`getEnglishSpellName()` never returns `null`; for spells not in `spellEffectData` it returns the numeric ID string (e.g., `"394088"`), which never matches the human-readable names in the blocklist. Fix: check `e.spellName` directly.

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` (line ~1868)

- [ ] **Step 1: Fix the blocklist check**

Old line:

```ts
if (englishName && PASSIVE_SPELL_BLOCKLIST.has(englishName)) continue;
```

New line:

```ts
if (PASSIVE_SPELL_BLOCKLIST.has(e.spellName)) continue;
```

(`englishName` is still computed one line above and used for `displayName` on the next line — don't remove that.)

---

## Task 5: Fix localization gaps — `removedSpellName` and `kickSpellName`

**Files:**

- Modify: `packages/shared/src/utils/dispelAnalysis.ts` (line ~553)
- Modify: `packages/shared/src/utils/ccTrinketAnalysis.ts` (line ~412)

- [ ] **Step 1: Fix `dispelAnalysis.ts` — `removedSpellName`**

Old:

```ts
        removedSpellName: action.extraSpellName,
```

New:

```ts
        removedSpellName: getEnglishSpellName(removedSpellId, action.extraSpellName),
```

(`removedSpellId` is already declared earlier in the same block — line ~540.)

- [ ] **Step 2: Fix `ccTrinketAnalysis.ts` — `kickSpellName`**

Old:

```ts
      kickSpellName: extraAction.extraSpellName,
```

New:

```ts
      kickSpellName: getEnglishSpellName(kickSpellId, extraAction.extraSpellName),
```

(`kickSpellId` is declared at line ~406 in the same block.)

---

## Task 6: Remove PII output files and gitignore them

`packages/tools/prompts_output.txt` and `packages/tools/sample_prompts.txt` contain real Battle.net player names and were accidentally committed.

**Files:**

- Create: `packages/tools/.gitignore`
- Git: remove both files from tracking

- [ ] **Step 1: Create `packages/tools/.gitignore`**

```
prompts_output.txt
sample_prompts.txt
```

- [ ] **Step 2: Remove the files from git tracking**

```bash
git rm --cached packages/tools/prompts_output.txt packages/tools/sample_prompts.txt
```

Expected output: `rm 'packages/tools/prompts_output.txt'` and `rm 'packages/tools/sample_prompts.txt'`.

---

## Task 7: Remove duplicate comment header

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` (lines ~81–82)

- [ ] **Step 1: Remove the orphan comment**

Delete the line:

```ts
// ── Context formatting helpers ─────────────────────────────────────────────
```

The next line `// ── Enemy major buff tracking (F67)` is the real section header.

---

## Task 8: Run full test suite and verify

- [ ] **Step 1: Run all tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: `Tests: 0 failed, 524 passed, 524 total` (no failures).

- [ ] **Step 2: Run lint**

```bash
npm run lint 2>&1 | tail -10
```

Expected: no warnings or errors.

---

## Task 9: Commit and merge

- [ ] **Step 1: Stage all changes**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git add packages/shared/src/utils/dispelAnalysis.ts
git add packages/shared/src/utils/ccTrinketAnalysis.ts
git add packages/tools/.gitignore
git add -u packages/tools/prompts_output.txt packages/tools/sample_prompts.txt
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix: resolve 7 post-review issues (B13 blocklist, B15/B31/B39 test regressions, localization gaps, PII files)

- B13: fix passive proc blocklist using e.spellName instead of getEnglishSpellName (which returned ID string for unknown spells)
- B15/F62/F64: fix HP dedup anchor — always emit in critical windows; use t%3 anchor outside
- B31: update 3 stale [CD EXPIRED] test assertions to [BUFF FADED]
- B39: remove premature early return that fired before enemy/CC parts were computed
- Localization: apply getEnglishSpellName to removedSpellName and kickSpellName
- Gitignore prompts_output.txt and sample_prompts.txt; remove from git tracking
- Remove duplicate comment header in utils.ts

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push to origin/main**

```bash
git push origin main
```
