# F89: [OWNER CAST] Cast/CC Annotation Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `[completed before CC landed]` and related ordering annotations fire consistently whenever a cast and CC event are within 1 second of each other in real time, regardless of displayed-second boundaries.

**Architecture:** The current heuristic in `buildMatchTimeline` matches cast and CC events by `Math.floor(timeSeconds)` — same "displayed second". This creates a blind spot at second boundaries: a cast at 21.999s and CC at 22.001s are 2ms apart but get no annotation, while a cast at 21.100s and CC at 21.900s (800ms apart) do. The fix replaces the floor-based match with a ms-proximity lookup (nearest CC within ±1000ms of the cast). All three ordering labels — `[completed before CC landed]`, `[succeeded after CC arrived — same second in log]`, `[same server tick as CC — cast succeeded per log]` — are retained with the same semantics but applied consistently.

**Tech Stack:** TypeScript, Jest

---

### Task 1: Write failing tests for second-boundary cases

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

The existing F68 test suite covers same-second cases. We need two new tests showing the boundary cases that currently produce no annotation but should.

- [ ] **Step 1: Locate the F68 test block**

Open `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` and find the `describe('buildMatchTimeline — F68 cast/CC disambiguation', ...)` block (around line 1819). All new tests go inside this block, after the last existing `it(...)` case (the "no CC events" test, around line 1921).

- [ ] **Step 2: Add two failing tests for adjacent-second proximity**

Insert the following two `it(...)` blocks immediately before the closing `});` of the F68 describe block:

```typescript
it('annotates [OWNER CAST] with [completed before CC landed] when cast is in second N and CC is at start of second N+1 (boundary case)', () => {
  // cast at 21.950s (displayed 0:21), CC at 22.050s (displayed 0:22)
  // 100ms apart — should annotate even though displayed seconds differ
  const castMs = MATCH_START_MS + 21_950;
  const ccMs = MATCH_START_MS + 22_050;
  const result = buildMatchTimeline(
    makeBaseParams({
      owner: makeOwnerWithCast(castMs),
      isHealer: true,
      matchStartMs: MATCH_START_MS,
      matchEndMs: MATCH_START_MS + 30_000,
      ccTrinketSummaries: [makeCCSummary(ccMs)],
    }),
  );
  const castLine = result.split('\n').find((l) => l.includes('[OWNER CAST]') && l.includes('Pain Suppression'));
  expect(castLine).toBeDefined();
  expect(castLine).toContain('[completed before CC landed]');
});

it('annotates [OWNER CAST] with [succeeded after CC arrived] when CC is in second N and cast is at start of second N+1 (boundary case)', () => {
  // CC at 21.950s (displayed 0:21), cast at 22.050s (displayed 0:22)
  // 100ms apart — should annotate even though displayed seconds differ
  const ccMs = MATCH_START_MS + 21_950;
  const castMs = MATCH_START_MS + 22_050;
  const result = buildMatchTimeline(
    makeBaseParams({
      owner: makeOwnerWithCast(castMs),
      isHealer: true,
      matchStartMs: MATCH_START_MS,
      matchEndMs: MATCH_START_MS + 30_000,
      ccTrinketSummaries: [makeCCSummary(ccMs)],
    }),
  );
  const castLine = result.split('\n').find((l) => l.includes('[OWNER CAST]') && l.includes('Pain Suppression'));
  expect(castLine).toBeDefined();
  expect(castLine).toContain('[succeeded after CC arrived — same second in log]');
});
```

- [ ] **Step 3: Run the new tests to confirm they fail**

```bash
npm run test -- --testPathPattern="timeline.test" --testNamePattern="boundary case" 2>&1 | tail -20
```

Expected: both tests FAIL — `castLine` does not contain the expected annotations because the current code only checks same displayed second.

---

### Task 2: Fix the heuristic to use ms-proximity instead of floor-based second matching

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` (lines ~1763–1792)

- [ ] **Step 1: Read the current implementation**

Lines 1763–1792 of `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`:

```typescript
    // F68: flat list of CC event ms timestamps for same-second disambiguation
    const ccMsTimestamps: number[] = ccTrinketSummaries.flatMap((s) =>
      s.ccInstances.map((cc) => Math.round(matchStartMs + cc.atSeconds * 1000)),
    );

    for (const e of owner.spellCastEvents ?? []) {
      if (e.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
      if (!e.spellId) continue;
      const displayName = HEALER_CAST_SPELL_ID_TO_NAME[e.spellId] ?? e.spellName;
      if (!displayName) continue;
      const tsMs = e.logLine.timestamp;
      const trackedSet = trackedCastsBySpellId.get(e.spellId);
      if (trackedSet && (trackedSet.has(tsMs) || trackedSet.has(tsMs - 1000) || trackedSet.has(tsMs + 1000))) continue;
      if (trinketUseTimesMs.has(tsMs) || trinketUseTimesMs.has(tsMs - 1000) || trinketUseTimesMs.has(tsMs + 1000))
        continue;
      const timeSeconds = (tsMs - matchStartMs) / 1000;

      // F68: detect CC events in the same displayed second and annotate order
      const castDisplaySecond = Math.floor(timeSeconds);
      const sameTick = ccMsTimestamps.find((ccMs) => Math.floor((ccMs - matchStartMs) / 1000) === castDisplaySecond);
      let orderNote = '';
      if (sameTick !== undefined) {
        if (tsMs < sameTick) {
          orderNote = ' [completed before CC landed]';
        } else if (tsMs > sameTick) {
          orderNote = ' [succeeded after CC arrived — same second in log]';
        } else {
          orderNote = ' [same server tick as CC — cast succeeded per log]';
        }
      }
```

- [ ] **Step 2: Replace the floor-based same-second match with ms-proximity lookup**

Replace lines 1780–1792 (the `// F68: detect CC events…` block through the end of the `orderNote` logic):

**Old code** (lines ~1780–1792):

```typescript
// F68: detect CC events in the same displayed second and annotate order
const castDisplaySecond = Math.floor(timeSeconds);
const sameTick = ccMsTimestamps.find((ccMs) => Math.floor((ccMs - matchStartMs) / 1000) === castDisplaySecond);
let orderNote = '';
if (sameTick !== undefined) {
  if (tsMs < sameTick) {
    orderNote = ' [completed before CC landed]';
  } else if (tsMs > sameTick) {
    orderNote = ' [succeeded after CC arrived — same second in log]';
  } else {
    orderNote = ' [same server tick as CC — cast succeeded per log]';
  }
}
```

**New code:**

```typescript
// F68/F89: find nearest CC within 1s — annotate ordering so Claude knows cast completed
// before or after incoming CC regardless of displayed-second boundary
const CC_PROXIMITY_MS = 1000;
const nearestCC = ccMsTimestamps
  .filter((ccMs) => Math.abs(ccMs - tsMs) <= CC_PROXIMITY_MS)
  .sort((a, b) => Math.abs(a - tsMs) - Math.abs(b - tsMs))[0];
let orderNote = '';
if (nearestCC !== undefined) {
  if (tsMs < nearestCC) {
    orderNote = ' [completed before CC landed]';
  } else if (tsMs > nearestCC) {
    orderNote = ' [succeeded after CC arrived — same second in log]';
  } else {
    orderNote = ' [same server tick as CC — cast succeeded per log]';
  }
}
```

Note: the variable `castDisplaySecond` is no longer needed — remove it too (it was only used by `sameTick`). The `timeSeconds` variable is still needed for `addEntry` below.

- [ ] **Step 3: Run the full F68 test suite to verify all tests pass**

```bash
npm run test -- --testPathPattern="timeline.test" --testNamePattern="F68" 2>&1 | tail -30
```

Expected: all existing tests (same-second cases, no-CC case) still PASS, and the two new boundary-case tests now PASS.

- [ ] **Step 4: Run the full timeline test suite**

```bash
npm run test -- --testPathPattern="timeline.test" 2>&1 | tail -30
```

Expected: all tests pass with no regressions.

- [ ] **Step 5: Run the full test suite**

```bash
npm run test 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "$(cat <<'EOF'
feat(timeline): fix cast/CC order annotation at second boundaries (F89)

Replace Math.floor same-second match with ±1000ms proximity window so
[completed before CC landed] and sibling annotations fire consistently
whenever cast and CC are close in real time, not just within the same
displayed second.
EOF
)"
```

---

### Task 3: Update TRACKER.md

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1: Mark F89 as Done**

In `TRACKER.md`, find the F89 row in the Features table and change its status from `Backlog` to `✅ Done`.

Current row:

```
| F89 | Backlog | `[OWNER CAST] ... [completed before CC landed]` annotation consistency audit — applied inconsistently across casts that finish just before incoming CC. Verify the heuristic and apply uniformly so Claude can rely on its presence/absence as signal. Source: 2026-05-02 healer prompt audit (Q7). | `printMatchPrompts.ts` (buildMatchTimeline) |
```

New row:

```
| F89 | ✅ Done | `[OWNER CAST] ... [completed before CC landed]` annotation consistency audit — applied inconsistently across casts that finish just before incoming CC. Verify the heuristic and apply uniformly so Claude can rely on its presence/absence as signal. Source: 2026-05-02 healer prompt audit (Q7). | `printMatchPrompts.ts` (buildMatchTimeline) |
```

- [ ] **Step 2: Commit tracker update**

```bash
git add TRACKER.md
git commit -m "chore: mark F89 done in TRACKER"
```
