# F85: Combined [STATE] HP Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace separate `[HP]` and `[ENEMY HP]` timeline lines with a single `[STATE]` line per tick, halving HP line count and dropping the `%` sign for token savings.

**Architecture:** The HP tick loop in `buildMatchTimeline` (`utils.ts`) currently calls `addEntry` twice per tick — once for `[HP]` and once for `[ENEMY HP]`. We merge both into one `[STATE]   friends 1:90 2:85 / enemies 3:35` call. Enemy section is only included in critical windows (same gate as before). The `%` sign is dropped since the unit is implicit. All existing tests that assert `[HP]` or `[ENEMY HP]` must be updated to the new format before the implementation lands.

**Tech Stack:** TypeScript 4.6, Jest (via TSDX), `packages/shared`

---

## File Map

| Action         | Path                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| Modify (tests) | `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` |
| Modify (impl)  | `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts:1978–2005`         |

---

### Task 1: Update all tests to expect `[STATE]` format

**File:** `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

All changes below are to the test file only — do NOT touch `utils.ts` in this task. After all changes the test suite will have failures because the production code still emits `[HP]`/`[ENEMY HP]`.

#### Group A — General HP tick tests (~line 739)

- [ ] **Step 1: Update the "emits [HP] ticks every 3s" test**

Find:

```typescript
expect(result).toContain('[HP]');
expect(result).toContain('Feramonk:84%');
expect(result).toContain('Feramonk:50%');
```

Replace with:

```typescript
expect(result).toContain('[STATE]');
expect(result).toContain('Feramonk:84');
expect(result).toContain('Feramonk:50');
```

- [ ] **Step 2: Update the "emits [HP] for multiple friends" test**

Find:

```typescript
expect(result).toContain('Healer:80%');
expect(result).toContain('DPS:100%');
// Both should be on the same [HP] line
const hpLine = result.split('\n').find((l) => l.includes('[HP]') && l.includes('Healer'));
expect(hpLine).toContain('DPS');
```

Replace with:

```typescript
expect(result).toContain('Healer:80');
expect(result).toContain('DPS:100');
// Both should be on the same [STATE] line
const hpLine = result.split('\n').find((l) => l.includes('[STATE]') && l.includes('Healer'));
expect(hpLine).toContain('DPS');
```

- [ ] **Step 3: Update the "omits [HP] ticks when no data" test**

Find:

```typescript
expect(result).not.toContain('[HP]');
```

Replace with:

```typescript
expect(result).not.toContain('[STATE]');
```

#### Group B — F62 dense HP tick tests (~line 1094)

- [ ] **Step 4: Update hp19Line check**

Find:

```typescript
const hp19Line = lines.find((l) => l.startsWith('0:19') && l.includes('[HP]'));
```

Replace with:

```typescript
const hp19Line = lines.find((l) => l.startsWith('0:19') && l.includes('[STATE]'));
```

- [ ] **Step 5: Update hp14Line and hp12Line checks**

Find:

```typescript
const hp14Line = lines.find((l) => l.startsWith('0:14') && l.includes('[HP]'));
expect(hp14Line).toBeUndefined();
// T=12 IS a 3s baseline tick
const hp12Line = lines.find((l) => l.startsWith('0:12') && l.includes('[HP]'));
```

Replace with:

```typescript
const hp14Line = lines.find((l) => l.startsWith('0:14') && l.includes('[STATE]'));
expect(hp14Line).toBeUndefined();
// T=12 IS a 3s baseline tick
const hp12Line = lines.find((l) => l.startsWith('0:12') && l.includes('[STATE]'));
```

- [ ] **Step 6: Update cc window hp14Line check (~line 1210)**

Find (inside the CC window test):

```typescript
const hp14Line = lines.find((l) => l.startsWith('0:14') && l.includes('[HP]'));
expect(hp14Line).toBeUndefined();
```

Replace with:

```typescript
const hp14Line = lines.find((l) => l.startsWith('0:14') && l.includes('[STATE]'));
expect(hp14Line).toBeUndefined();
```

- [ ] **Step 7: Update duplicate-tick dedup test (~line 1237–1239)**

Find:

```typescript
// Count occurrences of '0:25' in [HP] lines — should be exactly 1
const lines = result.split('\n').filter((l) => l.includes('[HP]') && l.startsWith('0:25'));
expect(lines.length).toBe(1);
```

Replace with:

```typescript
// Count occurrences of '0:25' in [STATE] lines — should be exactly 1
const lines = result.split('\n').filter((l) => l.includes('[STATE]') && l.startsWith('0:25'));
expect(lines.length).toBe(1);
```

- [ ] **Step 8: Update "only 3s multiples" check (~line 1259–1268)**

Find:

```typescript
for (const nonMultiple of [1, 2, 4, 5, 7, 8, 10, 11]) {
  const ts = `0:0${nonMultiple}`;
  const found = lines.find((l) => l.startsWith(ts) && l.includes('[HP]'));
  expect(found).toBeUndefined();
}
```

Replace with:

```typescript
for (const nonMultiple of [1, 2, 4, 5, 7, 8, 10, 11]) {
  const ts = `0:0${nonMultiple}`;
  const found = lines.find((l) => l.startsWith(ts) && l.includes('[STATE]'));
  expect(found).toBeUndefined();
}
```

#### Group C — F64 enemy HP in ticks tests (~line 1272)

- [ ] **Step 9: Rewrite the "includes friendly HP on [HP] and enemy HP on [ENEMY HP]" test body**

Find:

```typescript
// Friendly HP on [HP] lines, enemy HP on [ENEMY HP] lines
const hpLines = result.split('\n').filter((l) => /\[HP\]/.test(l) && !/\[ENEMY HP\]/.test(l));
const enemyHpLines = result.split('\n').filter((l) => l.includes('[ENEMY HP]'));
expect(hpLines.some((l) => l.includes('Feramonk:90%'))).toBeTruthy();
expect(enemyHpLines.some((l) => l.includes('Natjkis:35%'))).toBeTruthy();
// Enemy name must NOT appear on plain [HP] lines
for (const line of hpLines) {
  expect(line).not.toContain('Natjkis');
}
```

Replace with:

```typescript
// Both friend and enemy appear in [STATE] lines during critical window
const stateLines = result.split('\n').filter((l) => l.includes('[STATE]'));
expect(stateLines.some((l) => l.includes('Feramonk:90'))).toBeTruthy();
expect(stateLines.some((l) => l.includes('Natjkis:35'))).toBeTruthy();
// Enemy appears after '/ enemies', not in the friends section
for (const line of stateLines.filter((l) => l.includes('Natjkis'))) {
  const friendsPart = line.split('/ enemies')[0];
  expect(friendsPart).not.toContain('Natjkis');
}
```

Also update the test name (the `it(...)` string) to reflect the new behavior. Find:

```typescript
  it('includes friendly HP on [HP] line and enemy HP on [ENEMY HP] line during a critical window', () => {
```

Replace with:

```typescript
  it('includes friendly and enemy HP in a single [STATE] line during a critical window', () => {
```

- [ ] **Step 10: Update the "dense [ENEMY HP] ticks" test (~line 1336–1349)**

Find:

```typescript
// Dense window [50, 60] — expect consecutive 1s ticks on [ENEMY HP] lines
const enemyHpLines = result.split('\n').filter((l) => l.includes('[ENEMY HP]'));
const tickSeconds = enemyHpLines;
```

Replace with:

```typescript
// Dense window [50, 60] — expect consecutive 1s ticks on [STATE] lines with enemies
const enemyHpLines = result.split('\n').filter((l) => l.includes('[STATE]') && l.includes('enemies'));
const tickSeconds = enemyHpLines;
```

#### Group D — `[HP] / [ENEMY HP] split` describe block (~line 2371)

- [ ] **Step 11: Update "emits [HP] for friendly units on baseline ticks"**

Find:

```typescript
    expect(result).toContain('[HP]');
  });

  it('does NOT emit [ENEMY HP] on baseline ticks (no critical window)', () => {
```

Replace with:

```typescript
    expect(result).toContain('[STATE]');
  });

  it('does NOT emit enemies section on baseline ticks (no critical window)', () => {
```

- [ ] **Step 12: Update the "does NOT emit [ENEMY HP]" test body**

Find:

```typescript
    expect(result).not.toContain('[ENEMY HP]');
  });

  it('emits [ENEMY HP] on critical-window ticks (death window)', () => {
```

Replace with:

```typescript
    // On baseline ticks [STATE] may appear for friends, but no enemies section
    expect(result).not.toContain('/ enemies');
  });

  it('emits enemies section in [STATE] on critical-window ticks (death window)', () => {
```

- [ ] **Step 13: Update the "emits [ENEMY HP] on critical-window ticks" test body**

Find:

```typescript
    expect(result).toContain('[ENEMY HP]');
  });

  it('does NOT include enemy HP on [HP] lines', () => {
```

Replace with:

```typescript
    expect(result).toContain('/ enemies');
  });

  it('does NOT include enemy HP in the friends section of [STATE]', () => {
```

- [ ] **Step 14: Rewrite "does NOT include enemy HP on [HP] lines" test body**

Find:

```typescript
// [HP] lines must not contain enemy names; enemy HP goes on [ENEMY HP] lines
const hpLines = result.split('\n').filter((l) => /\[HP\]/.test(l) && !/\[ENEMY HP\]/.test(l));
for (const line of hpLines) {
  expect(line).not.toContain('Dzinked');
}
```

Replace with:

```typescript
// Enemy HP goes in the enemies section, not the friends section
const stateLines = result.split('\n').filter((l) => l.includes('[STATE]') && l.includes('Dzinked'));
for (const line of stateLines) {
  const friendsPart = line.split('/ enemies')[0];
  expect(friendsPart).not.toContain('Dzinked');
}
```

- [ ] **Step 15: Run the tests and verify they fail**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline" 2>&1 | grep -E "Tests:|FAIL|●" | head -10
```

Expected: multiple failures — the production code still emits `[HP]`/`[ENEMY HP]` with `%`, so the updated assertions now fail.

- [ ] **Step 16: Commit the test changes**

```bash
git -C /Users/mingjianliu/code/wowarenalogs add \
  packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git -C /Users/mingjianliu/code/wowarenalogs commit -m "test(timeline): update assertions from [HP]/[ENEMY HP] to [STATE] format (F85)"
```

---

### Task 2: Implement `[STATE]` combined HP line in utils.ts

**File:** `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Replace the HP tick loop (~lines 1978–2005)**

Find this entire block:

```typescript
for (const t of [...tickSet].sort((a, b) => a - b)) {
  const tsMs = matchStartMs + t * 1000;
  const sampleWindowMs = criticalWindowSet.has(t) ? HP_SAMPLE_WINDOW_CRITICAL_MS : HP_SAMPLE_WINDOW_BASELINE_MS;

  const friendlyParts = friendlyHpUnits
    .map(({ unit, label }) => {
      const pct = getUnitHpAtTimestamp(unit, tsMs, sampleWindowMs);
      return pct !== null ? `${label(unit.name)}:${pct}%` : null;
    })
    .filter((s): s is string => s !== null);

  if (friendlyParts.length > 0) {
    addEntry(t, `${fmtTime(t)}  [HP]   ${friendlyParts.join(' / ')}`);
  }

  // Enemy HP only in critical windows — suppressed on quiet baseline ticks
  if (criticalWindowSet.has(t) && enemyHpUnits.length > 0) {
    const enemyParts = enemyHpUnits
      .map(({ unit, label }) => {
        const pct = getUnitHpAtTimestamp(unit, tsMs, sampleWindowMs);
        return pct !== null ? `${label(unit.name)}:${pct}%` : null;
      })
      .filter((s): s is string => s !== null);

    if (enemyParts.length > 0) {
      addEntry(t, `${fmtTime(t)}  [ENEMY HP]   ${enemyParts.join(' / ')}`);
    }
  }
}
```

Replace with:

```typescript
for (const t of [...tickSet].sort((a, b) => a - b)) {
  const tsMs = matchStartMs + t * 1000;
  const sampleWindowMs = criticalWindowSet.has(t) ? HP_SAMPLE_WINDOW_CRITICAL_MS : HP_SAMPLE_WINDOW_BASELINE_MS;

  const friendlyParts = friendlyHpUnits
    .map(({ unit, label }) => {
      const pct = getUnitHpAtTimestamp(unit, tsMs, sampleWindowMs);
      return pct !== null ? `${label(unit.name)}:${pct}` : null;
    })
    .filter((s): s is string => s !== null);

  const enemyParts: string[] =
    criticalWindowSet.has(t) && enemyHpUnits.length > 0
      ? enemyHpUnits
          .map(({ unit, label }) => {
            const pct = getUnitHpAtTimestamp(unit, tsMs, sampleWindowMs);
            return pct !== null ? `${label(unit.name)}:${pct}` : null;
          })
          .filter((s): s is string => s !== null)
      : [];

  if (friendlyParts.length === 0 && enemyParts.length === 0) continue;

  let stateParts: string;
  if (friendlyParts.length > 0 && enemyParts.length > 0) {
    stateParts = `friends ${friendlyParts.join(' ')} / enemies ${enemyParts.join(' ')}`;
  } else if (friendlyParts.length > 0) {
    stateParts = `friends ${friendlyParts.join(' ')}`;
  } else {
    stateParts = `enemies ${enemyParts.join(' ')}`;
  }

  addEntry(t, `${fmtTime(t)}  [STATE]   ${stateParts}`);
}
```

- [ ] **Step 2: Run timeline tests**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline" --verbose 2>&1 | grep -E "PASS|FAIL|Tests:|●" | head -15
```

Expected: all tests pass.

- [ ] **Step 3: Run full shared suite**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared 2>&1 | tail -8
```

Expected: 0 failures.

- [ ] **Step 4: Commit**

```bash
git -C /Users/mingjianliu/code/wowarenalogs add \
  packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git -C /Users/mingjianliu/code/wowarenalogs commit -m "feat(timeline): replace [HP]/[ENEMY HP] with combined [STATE] line (F85)"
```

---

## Self-Review

**Spec coverage:** F85 says "replace separate `[HP]` and `[ENEMY HP]` lines with one `[STATE]` line". The implementation uses `[STATE]   friends ... / enemies ...`. Enemy section only in critical windows — same gate as old `[ENEMY HP]`. `%` dropped per spec example. ✅

**Placeholder scan:** All code blocks complete. No TBDs. ✅

**Type consistency:** `stateParts` is `string` throughout. `enemyParts` typed as `string[]`. `friendlyParts` typed as `string[]`. ✅

**Edge cases:**

- Only friendly data (baseline tick): `[STATE]   friends 1:90` — no `/enemies` section. Tests cover this.
- Only enemy data (impossible in practice — friendlyParts would be empty only if no friends provided, which is unusual): `[STATE]   enemies 3:35`. Handled by the else branch.
- Both empty: `continue` — no line emitted. Same behavior as old code where neither `[HP]` nor `[ENEMY HP]` would fire.
- Duplicate ticks (step 7 in Task 1): the new loop calls `addEntry` once per tick, so the dedup test trivially passes.

**Token impact note:** On a 400s match with 3s baseline ticks, the old code emitted ~267 `[HP]` lines. The new code emits the same number of `[STATE]` lines but each line drops 3 `%` chars per friendly player and replaces `/` separators (3 chars) with ` ` (1 char). In critical windows, the old code emitted two lines per tick; the new code emits one — halving HP line count in those windows.
