# F84: Stable [STATE] Ordering (Owner First) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the log owner first in the friends section of every `[STATE]` line, followed by other friends in their original array order.

**Architecture:** `buildMatchTimeline` builds `friendlyHpUnits` from `friends.map(...)` at line 1968 of `utils.ts`. Because `friends` is not guaranteed to start with the owner, the owner can appear anywhere. The fix: sort `friends` into a stable order (owner first, then others in original order) before building the unit list. The `owner` object is already available in scope. One-line change to `utils.ts`; one new test in `timeline.test.ts`.

**Tech Stack:** TypeScript 4.6, Jest (via TSDX), `packages/shared`

---

## File Map

| Action         | Path                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| Modify (tests) | `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` |
| Modify (impl)  | `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts:1968`              |

---

### Task 1: Write the failing test

**File:** `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

The existing `describe` block covering friends HP is in `describe('buildMatchTimeline — HP and [STATE] ticks', ...)` (or similar). Add the new test at the end of that block, after the "emits [HP] for multiple friends on the same tick" test (~line 782).

- [ ] **Step 1: Add the failing test**

Find the test at around line 782 that ends with:

```typescript
    expect(hpLine).toContain('DPS');
  });
```

Add this new test immediately after it (before any following `it(...)` or `});` that closes the describe block):

```typescript
it('puts log owner first in [STATE] friends section regardless of input order', () => {
  // Owner is 'Feramonk' (default makeBaseParams owner name)
  const ownerUnit = makeUnit('unit-1', {
    name: 'Feramonk',
    advancedActions: [makeAdvancedAction(3_000, 0, 0, 500_000, 400_000)], // 80%
  }) as ICombatUnit;
  const dpsUnit = makeUnit('unit-2', {
    name: 'DPS',
    advancedActions: [makeAdvancedAction(3_000, 0, 0, 500_000, 500_000)], // 100%
  }) as ICombatUnit;
  (dpsUnit as any).advancedActions[0].advancedActorId = 'unit-2';

  // DPS is listed first in the friends array — owner should still appear first in output
  const result = buildMatchTimeline(
    makeBaseParams({
      friends: [dpsUnit, ownerUnit],
      matchStartMs: 0,
      matchEndMs: 6_000,
    }),
  );

  const stateLine = result.split('\n').find((l) => l.includes('[STATE]') && l.includes('Feramonk'));
  expect(stateLine).toBeDefined();
  // Owner must appear before DPS in the friends section
  const ownerPos = stateLine!.indexOf('Feramonk');
  const dpsPos = stateLine!.indexOf('DPS');
  expect(ownerPos).toBeLessThan(dpsPos);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline" --verbose 2>&1 | grep -E "PASS|FAIL|owner first|●" | head -10
```

Expected: FAIL — the test currently puts DPS first (input order) so `ownerPos > dpsPos`.

- [ ] **Step 3: Commit the failing test**

```bash
git -C /Users/mingjianliu/code/wowarenalogs add \
  packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git -C /Users/mingjianliu/code/wowarenalogs commit -m "test(timeline): add failing test for owner-first [STATE] ordering (F84)"
```

---

### Task 2: Implement the owner-first ordering

**File:** `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Replace the `friendlyHpUnits` construction**

Find (around line 1968):

```typescript
const friendlyHpUnits: Array<{ unit: ICombatUnit; label: (name: string) => string }> = friends.map((u) => ({
  unit: u,
  label: (name: string) => pid(name),
}));
```

Replace with:

```typescript
const friendlyHpUnits: Array<{ unit: ICombatUnit; label: (name: string) => string }> = [
  ...friends.filter((u) => u.name === owner.name),
  ...friends.filter((u) => u.name !== owner.name),
].map((u) => ({ unit: u, label: (name: string) => pid(name) }));
```

This puts the owner unit first, then all others in their original order. If the owner is not in `friends` (edge case), `friends.filter(u => u.name === owner.name)` is empty and the remaining friends are emitted as-is — no regression.

- [ ] **Step 2: Run timeline tests**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline" --verbose 2>&1 | grep -E "PASS|FAIL|owner first|●" | head -10
```

Expected: all tests pass including the new one.

- [ ] **Step 3: Run full shared suite**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared 2>&1 | tail -6
```

Expected: 0 failures.

- [ ] **Step 4: Commit**

```bash
git -C /Users/mingjianliu/code/wowarenalogs add \
  packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git -C /Users/mingjianliu/code/wowarenalogs commit -m "feat(timeline): pin owner first in [STATE] friends section (F84)"
```

---

## Self-Review

**Spec coverage:** F84 says "Pin order: log owner first, then friends by index." The filter+spread pattern puts owner first and preserves original array order for the rest. ✅

**Placeholder scan:** No placeholders. All code is complete. ✅

**Type consistency:** `friendlyHpUnits` type `Array<{ unit: ICombatUnit; label: ... }>` is unchanged. The `.map()` call signature is identical to the original. ✅

**Edge cases:**

- Owner not in `friends`: first filter is empty, second filter returns all friends — behaves like current code.
- Owner appears multiple times in `friends` (shouldn't happen): all instances would be moved to the front. Harmless.
- `friends` is empty: both filters empty, `friendlyHpUnits` empty — no change.
