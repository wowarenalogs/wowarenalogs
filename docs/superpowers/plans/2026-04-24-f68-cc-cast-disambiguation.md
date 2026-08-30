# F68: Cast-Completion vs CC-Interrupt Disambiguation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an `[OWNER CAST]` and `[CC ON TEAM]` event share the same displayed second, append a sub-second ordering flag so Claude knows whether the cast completed before or after the CC landed.

**Architecture:** Both `SPELL_CAST_SUCCESS` events and CC `SPELL_AURA_APPLIED` events carry millisecond-precision timestamps in the raw log data. The timeline currently formats times with `fmtTime()` which truncates to seconds, making same-second events ambiguous. The fix builds a flat list of CC timestamps (ms) before the `[OWNER CAST]` loop and, for each healer cast that shares a display-second with a CC event, computes and appends an order note: `[completed before CC landed]`, `[succeeded after CC arrived — same second in log]`, or `[same server tick as CC — cast succeeded per log]`.

**Tech Stack:** TypeScript, Jest (via `npm run test` in `packages/shared`)

---

## File Map

- **Modify:** `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
  - Section: `[OWNER CAST]` block inside `buildMatchTimeline` (~lines 1405–1441)
  - Change: build `ccMsTimestamps` array before the cast loop; inside the loop, compute `orderNote` and append it to the `[OWNER CAST]` line.
- **Modify:** `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`
  - Add a new `describe` block: `buildMatchTimeline — F68 cast/CC disambiguation`

---

## Task 1: Write the failing tests

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Add the new describe block at the end of the test file**

Append after the last `});` in the file:

```typescript
describe('buildMatchTimeline — F68 cast/CC disambiguation', () => {
  const HEALER_SPELL_ID = '33206'; // Pain Suppression — in HEALER_CAST_SPELL_ID_TO_NAME
  const MATCH_START_MS = 1_000_000;

  function makeOwnerWithCast(castTimestampMs: number): ICombatUnit {
    return {
      ...makeOwner('Feramonk'),
      spellCastEvents: [
        makeSpellCastEvent(HEALER_SPELL_ID, castTimestampMs, 'player-2', 'Simplesauce', 'player-1', 'Feramonk'),
      ],
    } as ICombatUnit;
  }

  function makeCCSummary(ccAtMs: number): IPlayerCCTrinketSummary {
    const cc: ICCInstance = {
      atSeconds: (ccAtMs - MATCH_START_MS) / 1000,
      durationSeconds: 4,
      spellId: '107570',
      spellName: 'Storm Bolt',
      sourceName: 'EnemyPlayer',
      sourceSpec: 'Arms Warrior',
      damageTakenDuring: 50_000,
      trinketState: 'available_unused',
      drInfo: null,
      distanceYards: null,
      losBlocked: null,
    };
    return { ...makeEmptyCCTrinketSummary('Feramonk'), ccInstances: [cc] };
  }

  it('annotates [OWNER CAST] with [completed before CC landed] when cast ms < CC ms in same second', () => {
    // cast at 21.100s, CC at 21.700s — both display as 0:21
    const castMs = MATCH_START_MS + 21_100;
    const ccMs = MATCH_START_MS + 21_700;
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

  it('annotates [OWNER CAST] with [succeeded after CC arrived] when cast ms > CC ms in same second', () => {
    // CC at 21.100s, cast at 21.800s — both display as 0:21
    const ccMs = MATCH_START_MS + 21_100;
    const castMs = MATCH_START_MS + 21_800;
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

  it('annotates [OWNER CAST] with [same server tick as CC] when cast ms === CC ms', () => {
    const sharedMs = MATCH_START_MS + 21_500;
    const result = buildMatchTimeline(
      makeBaseParams({
        owner: makeOwnerWithCast(sharedMs),
        isHealer: true,
        matchStartMs: MATCH_START_MS,
        matchEndMs: MATCH_START_MS + 30_000,
        ccTrinketSummaries: [makeCCSummary(sharedMs)],
      }),
    );
    const castLine = result.split('\n').find((l) => l.includes('[OWNER CAST]') && l.includes('Pain Suppression'));
    expect(castLine).toBeDefined();
    expect(castLine).toContain('[same server tick as CC — cast succeeded per log]');
  });

  it('does not annotate [OWNER CAST] when cast and CC are in different displayed seconds', () => {
    // cast at 21.500s (0:21), CC at 22.500s (0:22) — different display seconds
    const castMs = MATCH_START_MS + 21_500;
    const ccMs = MATCH_START_MS + 22_500;
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
    expect(castLine).not.toContain('[completed before');
    expect(castLine).not.toContain('[succeeded after');
    expect(castLine).not.toContain('[same server tick');
  });

  it('does not annotate [OWNER CAST] when there are no CC events', () => {
    const castMs = MATCH_START_MS + 21_500;
    const result = buildMatchTimeline(
      makeBaseParams({
        owner: makeOwnerWithCast(castMs),
        isHealer: true,
        matchStartMs: MATCH_START_MS,
        matchEndMs: MATCH_START_MS + 30_000,
        ccTrinketSummaries: [],
      }),
    );
    const castLine = result.split('\n').find((l) => l.includes('[OWNER CAST]') && l.includes('Pain Suppression'));
    expect(castLine).toBeDefined();
    expect(castLine).not.toContain('[completed before');
    expect(castLine).not.toContain('[succeeded after');
    expect(castLine).not.toContain('[same server tick');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline.test" 2>&1 | tail -30
```

Expected: 5 new tests fail with something like "Expected string containing '[completed before CC landed]'" or "undefined" on the `castLine` assertion.

- [ ] **Step 3: Commit the failing tests**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "test(F68): add failing tests for cast/CC same-second disambiguation"
```

---

## Task 2: Implement the disambiguation annotation

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

The `[OWNER CAST]` block starts at line ~1405. The relevant section is:

```typescript
// ── [OWNER CAST] healer gap-filler (F61) ────────────────────────────────────

if (isHealer) {
  // Build a dedup set of raw timestamps (ms) for each tracked spell so the ±1s float
  // rounding trick is not needed — this avoids edge cases where matchStartMs reference
  // points diverge or cast times are at half-second boundaries.
  const trackedCastsBySpellId = new Map<string, Set<number>>();
  for (const cd of ownerCDs) {
    trackedCastsBySpellId.set(
      cd.spellId,
      new Set(cd.casts.map((c) => matchStartMs + Math.round(c.timeSeconds * 1000))),
    );
  }
  // Collect all trinket-use timestamps so we can suppress the matching SPELL_CAST_SUCCESS
  // event — trinket uses are already tracked by [TRINKET] events and would double-emit.
  const trinketUseTimesMs = new Set(
    ccTrinketSummaries.flatMap((s) => s.trinketUseTimes.map((t) => Math.round(matchStartMs + t * 1000))),
  );

  for (const e of owner.spellCastEvents ?? []) {
    if (e.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
    if (!e.spellId) continue;
    // Use canonical name from healer map when known; fall back to raw log spell name.
    const displayName = HEALER_CAST_SPELL_ID_TO_NAME[e.spellId] ?? e.spellName;
    if (!displayName) continue;
    const tsMs = e.logLine.timestamp;
    const trackedSet = trackedCastsBySpellId.get(e.spellId);
    // Allow ±1000ms tolerance to absorb server/client timestamp drift
    if (trackedSet && (trackedSet.has(tsMs) || trackedSet.has(tsMs - 1000) || trackedSet.has(tsMs + 1000))) continue;
    // Suppress trinket casts — already tracked by [TRINKET] events
    if (trinketUseTimesMs.has(tsMs) || trinketUseTimesMs.has(tsMs - 1000) || trinketUseTimesMs.has(tsMs + 1000))
      continue;
    const timeSeconds = (tsMs - matchStartMs) / 1000;
    const targetLabel = resolveTarget(e.destUnitName);
    const targetPart = targetLabel ? ` → ${targetLabel}` : '';
    addEntry(timeSeconds, `${fmtTime(timeSeconds)}  [OWNER CAST]   ${displayName}${targetPart}`);
  }
}
```

- [ ] **Step 4: Add the `ccMsTimestamps` array before the cast loop, and the `orderNote` computation inside the loop**

Replace only the `if (isHealer)` block. The new version:

```typescript
// ── [OWNER CAST] healer gap-filler (F61) ────────────────────────────────────

if (isHealer) {
  const trackedCastsBySpellId = new Map<string, Set<number>>();
  for (const cd of ownerCDs) {
    trackedCastsBySpellId.set(
      cd.spellId,
      new Set(cd.casts.map((c) => matchStartMs + Math.round(c.timeSeconds * 1000))),
    );
  }
  const trinketUseTimesMs = new Set(
    ccTrinketSummaries.flatMap((s) => s.trinketUseTimes.map((t) => Math.round(matchStartMs + t * 1000))),
  );

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

    const targetLabel = resolveTarget(e.destUnitName);
    const targetPart = targetLabel ? ` → ${targetLabel}` : '';
    addEntry(timeSeconds, `${fmtTime(timeSeconds)}  [OWNER CAST]   ${displayName}${targetPart}${orderNote}`);
  }
}
```

Use the Edit tool to make this change. The exact `old_string` to match is the full `if (isHealer)` block from the comment line through its closing brace.

- [ ] **Step 5: Run the tests and verify all 5 new tests pass**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline.test" 2>&1 | tail -30
```

Expected: All tests pass, 0 failures. Existing tests must also still pass.

- [ ] **Step 6: Run lint to verify no issues**

```bash
npm run lint -w @wowarenalogs/shared 2>&1 | tail -20
```

Expected: No errors or warnings.

- [ ] **Step 7: Commit the implementation**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "feat(F68): annotate [OWNER CAST] with sub-second CC ordering when timestamps share display second"
```

---

## Task 3: Update TRACKER.md

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 8: Move F68 from Backlog to done**

In `TRACKER.md`, remove the F68 row from the Features table. Then open `TRACKER_ARCHIVE.md` and add the row under the completed Features section.

Row to remove from `TRACKER.md`:

```
| F68 | Backlog | Cast-completion vs. CC-interrupt disambiguation — when a CC event and an owner cast share the same timestamp (e.g., Storm Bolt at 0:21 with 1s left and Pain Suppression at 0:21), add a sub-second ordering flag or note whether the cast completed before or after the CC landed. Currently unresolvable from timestamps alone; Claude repeatedly flags this as a confidence gap                                                                             | `utils.ts` (`buildMatchTimeline`)                                        |
```

Row to add to `TRACKER_ARCHIVE.md` (under `## Features — Completed`):

```
| F68 | ✅ Done | Cast-completion vs. CC-interrupt disambiguation — when `[OWNER CAST]` and `[CC ON TEAM]` share the same display second, appends `[completed before CC landed]`, `[succeeded after CC arrived — same second in log]`, or `[same server tick as CC — cast succeeded per log]` using millisecond-precision timestamps from the raw log | `utils.ts` (`buildMatchTimeline`) |
```

- [ ] **Step 9: Commit the tracker update**

```bash
git add TRACKER.md TRACKER_ARCHIVE.md
git commit -m "chore: mark F68 done in tracker"
```

---

## Self-Review

**Spec coverage check:**

- ✅ Same-timestamp CC + cast → sub-second ordering flag appended to `[OWNER CAST]`
- ✅ Three cases covered: cast before CC, cast after CC, same exact tick
- ✅ No annotation when cast and CC are in different seconds
- ✅ No annotation when no CC events present
- ✅ Tests TDD-first, committed before implementation

**Placeholder scan:** No placeholders. All code shown in full.

**Type consistency:** `ccMsTimestamps: number[]`, `sameTick: number | undefined`, `orderNote: string` — all consistent.

**Scope note:** The annotation only applies to `[OWNER CAST]` events (healer-only). The `[CC ON TEAM]` line itself is unchanged — Claude already has the CC timing from that line; the annotation on the cast line is what closes the ambiguity gap.
