# F87: Suppress Empty [RES] Lines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop emitting `[RES] rdy:—  cd:—` lines when all four data parts (ready CDs, CDs on cooldown, active enemy CDs, active CC) are empty, since these lines contribute zero information to the LLM context.

**Architecture:** `buildResourceSnapshot` in `utils.ts` already computes all four data parts independently before assembling the line. Add an early-return `''` guard at the bottom when all parts are empty. Update the inner `addEntry` helper to filter empty strings from its `lines` spread so that a `''` return from `resourceSnapshot()` doesn't produce a blank line in the timeline output.

**Tech Stack:** TypeScript, Jest via `npx tsdx test`. File under test: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`. Existing test file: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`.

---

## File Map

| File                                                                                      | Action                                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Modify `buildResourceSnapshot` (add guard) and `addEntry` (filter empties)          |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Add 2 tests in existing `buildResourceSnapshot — F72 compact format` describe block |

---

## Background: why the bug fires

`buildResourceSnapshot` is called at the timestamp of every `[OWNER CD]` and `[TEAMMATE CD]` event. The ready-CDs logic at line ~1291 suppresses never-used CDs when `timeSeconds <= 5`:

```typescript
if (priorCasts.length === 0) {
  if (timeSeconds > 5) readyNames.push(spellName);
  continue;
}
```

So when a player's **first** CD fires within the opening 5 seconds:

- `readyNames` is empty (suppressed by the `> 5` guard)
- `onCDParts` is empty (the just-cast spell: `priorCasts` filtered to `< timeSeconds − 0.5` so the cast itself doesn't appear)
- `enemyActiveParts` likely empty (no enemy CDs yet)
- `ccParts` empty (no CC yet)

Result: `      [RES] rdy:—  cd:—` — a line with no signal.

The same condition can also arise mid-match when all tracked CDs happen to be in a state where none qualify for either list and there is no active enemy threat or CC.

---

## Task 1: Suppress empty `[RES]` lines

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` (lines ~1307–1383 and ~1656–1658)
- Test: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Open `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`.

Locate the existing describe block `buildResourceSnapshot — F72 compact format` (around line 2426). Add these two tests **inside** that describe block, after the last existing test:

```typescript
it('returns empty string when timeSeconds ≤ 5 and all CDs never-used (early-match empty line)', () => {
  // At t=3s, the > 5 guard suppresses never-used CDs from readyNames.
  // No enemy or CC data → all four parts empty → must return ''.
  const avWr = makeCD('Avenging Wrath', 120); // never used
  const result = buildResourceSnapshot({
    timeSeconds: 3,
    ownerCDs: [avWr],
    ownerName: 'Player1',
    ownerSpec: 'Holy Paladin',
    teammateCDs: [],
    ccTrinketSummaries: [],
    enemyCDTimeline: BASE_ENEMY_TIMELINE,
  });
  expect(result).toBe('');
});

it('returns empty string when all parts empty mid-match (no ready, no cd, no enemy, no cc)', () => {
  // Scenario: all owner CDs were cast very recently (all on cooldown with > timeSeconds remaining)
  // and no enemy activity and no CC → empty [RES] line should be suppressed.
  const cd = {
    ...makeCD('Holy Light', 30),
    // cast 2s ago, CD=30s → ready at t=32, we're at t=20 → still on cooldown
    casts: [{ timeSeconds: 18 }],
  };
  const result = buildResourceSnapshot({
    timeSeconds: 20,
    ownerCDs: [cd],
    ownerName: 'Player1',
    ownerSpec: 'Holy Paladin',
    teammateCDs: [],
    ccTrinketSummaries: [],
    enemyCDTimeline: BASE_ENEMY_TIMELINE,
  });
  // cd:Holy Light(28s) → onCDParts has content → should NOT be empty
  // This test verifies we only suppress when ALL parts are empty.
  // Holy Light is on CD here so result should NOT be empty:
  expect(result).not.toBe('');
  expect(result).toContain('cd:Holy Light(');
});
```

Note: the second test is actually a **non-suppression** check — it confirms we only suppress when all four parts are empty, not just when rdy is empty.

Add one more test that confirms full suppression with zero data:

```typescript
it('returns empty string when truly all data is absent', () => {
  const result = buildResourceSnapshot({
    timeSeconds: 60,
    ownerCDs: [],
    ownerName: 'Player1',
    ownerSpec: 'Holy Paladin',
    teammateCDs: [],
    ccTrinketSummaries: [],
    enemyCDTimeline: BASE_ENEMY_TIMELINE,
  });
  expect(result).toBe('');
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern=timeline --watchAll=false 2>&1 | grep -E "FAIL|PASS|●" | head -20
```

Expected: the new tests fail because `buildResourceSnapshot` currently returns `[RES] rdy:—  cd:—` instead of `''`.

- [ ] **Step 1.3: Add early-return guard in `buildResourceSnapshot`**

Open `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`.

Locate the end of `buildResourceSnapshot` — just before the final `return line;` (line ~1382). Replace:

```typescript
  return line;
}
```

with:

```typescript
  if (readyNames.length === 0 && onCDParts.length === 0 && enemyActiveParts.length === 0 && ccParts.length === 0) {
    return '';
  }
  return line;
}
```

- [ ] **Step 1.4: Update `addEntry` to filter empty strings**

Still in `utils.ts`, locate `addEntry` (line ~1656):

```typescript
function addEntry(timeSeconds: number, ...lines: string[]) {
  entries.push({ timeSeconds, lines });
}
```

Replace with:

```typescript
function addEntry(timeSeconds: number, ...lines: string[]) {
  entries.push({ timeSeconds, lines: lines.filter(Boolean) });
}
```

This prevents the empty `''` return from `resourceSnapshot()` producing a blank line when passed as a spread argument to `addEntry` (see lines ~1728 and ~1803 where `resourceSnapshot(t)` is spread into `addEntry`).

- [ ] **Step 1.5: Run tests to confirm they pass**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern=timeline --watchAll=false 2>&1 | tail -15
```

Expected: all tests pass, including the 3 new ones.

- [ ] **Step 1.6: Run full test suite — no regressions**

```bash
npm run -w @wowarenalogs/shared test -- --watchAll=false 2>&1 | tail -8
```

Expected: all test suites pass.

- [ ] **Step 1.7: Lint**

```bash
npm run -w @wowarenalogs/shared lint 2>&1 | tail -5
```

Expected: no warnings or errors.

- [ ] **Step 1.8: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "fix(timeline): suppress empty [RES] rdy:— cd:— lines (F87)"
```
