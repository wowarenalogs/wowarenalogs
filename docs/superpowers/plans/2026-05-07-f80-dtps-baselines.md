# F80: DMG SPIKE Baseline Context — DTPS Baselines in MATCH FACTS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit per-spec median/p90 incoming-damage baselines (per 10-second window) in the MATCH FACTS section so a fresh-context AI reader can judge whether a `[DMG SPIKE]` value is extreme or routine.

**Architecture:** The benchmark data already contains `pressureWindows.p50` and `pressureWindows.p90` (raw damage per 10s window) in `benchmarks.json`, but the TypeScript `ISpecBaseline` interface doesn't expose them yet. We extend the interface and add a new `formatDTPSBaselines(friendlySpecs, data)` function to `specBaselines.ts`, then wire it into all three prompt-builder entry points (`index.tsx`, `buildMatchPromptNew`, `buildMatchPromptJson`).

**Tech Stack:** TypeScript, Jest, existing `benchmarks.json` data

---

## File Map

| File                                                                     | Change                                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/shared/src/utils/specBaselines.ts`                             | Extend `ISpecBaseline` to include `pressureWindows`; add `formatDTPSBaselines()` |
| `packages/shared/src/utils/__tests__/specBaselines.test.ts`              | Add tests for `formatDTPSBaselines`                                              |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx` | Call `formatDTPSBaselines` with all friendly specs                               |
| `packages/tools/src/printMatchPrompts.ts`                                | Call `formatDTPSBaselines` in `buildMatchPromptNew` and `buildMatchPromptJson`   |

---

### Task 1: Extend `ISpecBaseline` and add `formatDTPSBaselines` in specBaselines.ts

**Files:**

- Modify: `packages/shared/src/utils/specBaselines.ts`

The `benchmarks.json` already contains `pressureWindows: { p50, p75, p90, p95 }` for each spec, but `ISpecBaseline` does not declare this field, so TypeScript loses the data on the `as unknown as IBenchmarkData` cast. We extend the interface and add the new formatting function.

**Output format for `formatDTPSBaselines`:**

```
INCOMING DAMAGE BASELINES (per 10s window, ≥2100 MMR):
  Paladin Holy (n=45): p50 6k | p90 241k
  Rogue Subtlety (n=56): p50 64k | p90 334k
```

- [ ] **Step 1: Write the failing test first** (in Task 2 — but read the implementation spec here first, then implement)

- [ ] **Step 2: Implement the changes to `specBaselines.ts`**

Replace the file's content with:

```typescript
import benchmarksJson from '../data/benchmarks.json';
import { fmtTime, IMajorCooldownInfo } from './cooldowns';

// benchmarks.json is a copy of packages/tools/benchmarks/benchmark_data.json.
// Re-run collectBenchmarks and copy the output here to keep them in sync.

interface ISpecCDBaseline {
  neverUsedRate: number;
  medianFirstUseSeconds: number | null;
  p75FirstUseSeconds: number | null;
}

interface ISpecBaseline {
  sampleCount: number;
  defensiveTiming: {
    optimalPct: number;
    earlyPct: number;
    latePct: number;
    reactivePct: number;
    unknownPct: number;
  } | null;
  cdUsage: Record<string, ISpecCDBaseline>;
  pressureWindows?: { p50: number; p75: number; p90: number; p95: number };
}

export interface IBenchmarkData {
  bySpec: Record<string, ISpecBaseline>;
}

export const benchmarks: IBenchmarkData = benchmarksJson as unknown as IBenchmarkData;

export function formatSpecBaselines(ownerSpec: string, ownerCDs: IMajorCooldownInfo[], data: IBenchmarkData): string[] {
  const spec = data.bySpec[ownerSpec];
  if (!spec) return [];

  const lines: string[] = [];
  lines.push(`SPEC BASELINES — ${ownerSpec} at ≥2100 MMR (n=${spec.sampleCount}):`);

  const dt = spec.defensiveTiming;
  if (dt) {
    lines.push(
      `  Defensive timing: Optimal ${Math.round(dt.optimalPct)}% | Early ${Math.round(dt.earlyPct)}% | Late ${Math.round(dt.latePct)}% | Reactive ${Math.round(dt.reactivePct)}% | Unknown ${Math.round(dt.unknownPct)}%`,
    );
  }

  const relevantCDs = ownerCDs.filter((cd) => spec.cdUsage[cd.spellName]);
  if (relevantCDs.length > 0) {
    lines.push('  CD reference (% of matches used | median first use | p75 first use):');
    for (const cd of relevantCDs) {
      const baseline = spec.cdUsage[cd.spellName];
      const usedPct = Math.round((1 - baseline.neverUsedRate) * 100);
      const median = baseline.medianFirstUseSeconds !== null ? fmtTime(baseline.medianFirstUseSeconds) : '—';
      const p75 = baseline.p75FirstUseSeconds !== null ? fmtTime(baseline.p75FirstUseSeconds) : '—';
      lines.push(`    ${cd.spellName}: ${usedPct}% used | ${median} median | ${p75} p75`);
    }
  }

  return lines;
}

/**
 * Emits a per-spec incoming-damage baseline block for all friendly specs that have
 * benchmark data. Helps the model interpret [DMG SPIKE] magnitudes.
 * Each value is the total damage received in a 10-second window at ≥2100 MMR.
 */
export function formatDTPSBaselines(friendlySpecs: string[], data: IBenchmarkData): string[] {
  const rows: string[] = [];
  for (const spec of friendlySpecs) {
    const entry = data.bySpec[spec];
    if (!entry?.pressureWindows) continue;
    const p50k = Math.round(entry.pressureWindows.p50 / 1000);
    const p90k = Math.round(entry.pressureWindows.p90 / 1000);
    rows.push(`  ${spec} (n=${entry.sampleCount}): p50 ${p50k}k | p90 ${p90k}k`);
  }
  if (rows.length === 0) return [];
  return ['INCOMING DAMAGE BASELINES (per 10s window, ≥2100 MMR):', ...rows];
}
```

- [ ] **Step 3: Run lint**

```bash
npm run lint -w @wowarenalogs/shared 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/utils/specBaselines.ts
git commit -m "feat(specBaselines): add formatDTPSBaselines for per-spec incoming-damage context (F80)"
```

---

### Task 2: Add tests for `formatDTPSBaselines`

**Files:**

- Modify: `packages/shared/src/utils/__tests__/specBaselines.test.ts`

- [ ] **Step 1: Read the test file**

Open `packages/shared/src/utils/__tests__/specBaselines.test.ts`. You'll see `mockData` at the top using `IBenchmarkData`. The existing `describe('formatSpecBaselines', ...)` block ends around line 91.

The `mockData` object currently looks like:

```typescript
const mockData: IBenchmarkData = {
  bySpec: {
    'Rogue Subtlety': {
      sampleCount: 56,
      defensiveTiming: { optimalPct: 43.2, earlyPct: 10.8, latePct: 13.5, reactivePct: 13.5, unknownPct: 18.9 },
      cdUsage: {
        'Cloak of Shadows': { neverUsedRate: 0.393, medianFirstUseSeconds: 94.314, p75FirstUseSeconds: 121.941 },
        'Shadow Blades': { neverUsedRate: 0.036, medianFirstUseSeconds: 20.664, p75FirstUseSeconds: 34.649 },
      },
    },
  },
};
```

- [ ] **Step 2: Update the import line and mockData, then add tests**

Change the import at line 2 to also import `formatDTPSBaselines`:

```typescript
import { formatDTPSBaselines, formatSpecBaselines, IBenchmarkData } from '../specBaselines';
```

Add `pressureWindows` to the existing `mockData` `'Rogue Subtlety'` entry, and add a second spec:

```typescript
const mockData: IBenchmarkData = {
  bySpec: {
    'Rogue Subtlety': {
      sampleCount: 56,
      defensiveTiming: { optimalPct: 43.2, earlyPct: 10.8, latePct: 13.5, reactivePct: 13.5, unknownPct: 18.9 },
      cdUsage: {
        'Cloak of Shadows': { neverUsedRate: 0.393, medianFirstUseSeconds: 94.314, p75FirstUseSeconds: 121.941 },
        'Shadow Blades': { neverUsedRate: 0.036, medianFirstUseSeconds: 20.664, p75FirstUseSeconds: 34.649 },
      },
      pressureWindows: { p50: 63_692, p75: 174_111, p90: 334_343, p95: 447_203 },
    },
    'Paladin Holy': {
      sampleCount: 45,
      defensiveTiming: null,
      cdUsage: {},
      pressureWindows: { p50: 6_200, p75: 120_000, p90: 241_100, p95: 350_000 },
    },
  },
};
```

Then add a new `describe('formatDTPSBaselines', ...)` block **after** the existing `describe('formatSpecBaselines', ...)` block:

```typescript
describe('formatDTPSBaselines', () => {
  it('returns empty array when no friendly specs match benchmark data', () => {
    expect(formatDTPSBaselines(['Unknown Spec'], mockData)).toEqual([]);
  });

  it('returns empty array for empty friendlySpecs', () => {
    expect(formatDTPSBaselines([], mockData)).toEqual([]);
  });

  it('emits header and one row per matched spec', () => {
    const lines = formatDTPSBaselines(['Rogue Subtlety', 'Paladin Holy'], mockData);
    expect(lines[0]).toBe('INCOMING DAMAGE BASELINES (per 10s window, ≥2100 MMR):');
    expect(lines.length).toBe(3); // header + 2 rows
  });

  it('rounds p50 and p90 to nearest k', () => {
    const lines = formatDTPSBaselines(['Rogue Subtlety'], mockData);
    // p50=63692 → 64k, p90=334343 → 334k
    expect(lines.some((l) => l.includes('p50 64k') && l.includes('p90 334k'))).toBe(true);
  });

  it('includes sample count in each row', () => {
    const lines = formatDTPSBaselines(['Rogue Subtlety'], mockData);
    expect(lines.some((l) => l.includes('n=56'))).toBe(true);
  });

  it('skips specs missing pressureWindows silently', () => {
    const dataWithoutPW: IBenchmarkData = {
      bySpec: {
        'No PW Spec': { sampleCount: 10, defensiveTiming: null, cdUsage: {} },
      },
    };
    expect(formatDTPSBaselines(['No PW Spec'], dataWithoutPW)).toEqual([]);
  });

  it('only includes specs present in both friendlySpecs and benchmark data', () => {
    const lines = formatDTPSBaselines(['Rogue Subtlety', 'Druid Balance'], mockData);
    // Druid Balance not in mockData → only Rogue row
    expect(lines.length).toBe(2); // header + 1 row
    expect(lines.some((l) => l.includes('Rogue Subtlety'))).toBe(true);
    expect(lines.some((l) => l.includes('Druid Balance'))).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails first** (before Task 1 is done — if Task 1 was already done, run to verify it passes)

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern specBaselines 2>&1 | tail -20
```

Expected: all tests pass (Task 1 must be complete first).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/utils/__tests__/specBaselines.test.ts
git commit -m "test(specBaselines): add formatDTPSBaselines tests (F80)"
```

---

### Task 3: Wire `formatDTPSBaselines` into `index.tsx`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`

- [ ] **Step 1: Update the import**

Find the import line (around line 38):

```typescript
import { benchmarks, formatSpecBaselines } from '../../../utils/specBaselines';
```

Change it to:

```typescript
import { benchmarks, formatDTPSBaselines, formatSpecBaselines } from '../../../utils/specBaselines';
```

- [ ] **Step 2: Find the block where `specBaselineLines` is used**

Around line 206–212 in `index.tsx`, there's a block:

```typescript
const baselineLines = formatSpecBaselines(ownerSpec, cooldowns, benchmarks);
if (baselineLines.length > 0) {
  tLines.push('');
  baselineLines.forEach((l) => tLines.push(l));
}
```

- [ ] **Step 3: Add `formatDTPSBaselines` call immediately after that block**

The friendly specs are available as `friends.map((p) => specToString(p.spec))`. Insert after the `baselineLines` block:

```typescript
const dtpsLines = formatDTPSBaselines(
  friends.map((p) => specToString(p.spec)),
  benchmarks,
);
if (dtpsLines.length > 0) {
  tLines.push('');
  dtpsLines.forEach((l) => tLines.push(l));
}
```

- [ ] **Step 4: Run lint**

```bash
npm run lint -w @wowarenalogs/shared 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx
git commit -m "feat(prompt): emit DTPS baselines in MATCH FACTS for index.tsx (F80)"
```

---

### Task 4: Wire `formatDTPSBaselines` into `printMatchPrompts.ts`

**Files:**

- Modify: `packages/tools/src/printMatchPrompts.ts`

The file already imports `formatSpecBaselines` from `specBaselines` on line 71:

```typescript
import { benchmarks, formatSpecBaselines } from '../../shared/src/utils/specBaselines';
```

There are two functions to update: `buildMatchPromptNew` (around line 925) and `buildMatchPromptJson` (around line 1063).

- [ ] **Step 1: Update the import**

Change:

```typescript
import { benchmarks, formatSpecBaselines } from '../../shared/src/utils/specBaselines';
```

To:

```typescript
import { benchmarks, formatDTPSBaselines, formatSpecBaselines } from '../../shared/src/utils/specBaselines';
```

- [ ] **Step 2: Add `formatDTPSBaselines` call in `buildMatchPromptNew`**

Find the existing `specBaselineLines` block in `buildMatchPromptNew` (around line 939):

```typescript
const specBaselineLines = formatSpecBaselines(ownerSpec, ownerCDs, benchmarks);
if (specBaselineLines.length > 0) {
  lines.push(...specBaselineLines);
  lines.push('');
}
```

Add immediately after:

```typescript
const dtpsBaselineLines = formatDTPSBaselines(
  friends.map((p) => specToString(p.spec)),
  benchmarks,
);
if (dtpsBaselineLines.length > 0) {
  lines.push(...dtpsBaselineLines);
  lines.push('');
}
```

- [ ] **Step 3: Add `formatDTPSBaselines` call in `buildMatchPromptJson`**

Find the same `specBaselineLines` block in `buildMatchPromptJson` (around line 1078):

```typescript
const specBaselineLines = formatSpecBaselines(ownerSpec, ownerCDs, benchmarks);
if (specBaselineLines.length > 0) {
  lines.push(...specBaselineLines);
  lines.push('');
}
```

Add immediately after (same pattern as Step 2):

```typescript
const dtpsBaselineLines = formatDTPSBaselines(
  friends.map((p) => specToString(p.spec)),
  benchmarks,
);
if (dtpsBaselineLines.length > 0) {
  lines.push(...dtpsBaselineLines);
  lines.push('');
}
```

- [ ] **Step 4: Run lint**

```bash
npm run lint -w @wowarenalogs/tools 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/printMatchPrompts.ts
git commit -m "feat(prompt): emit DTPS baselines in buildMatchPromptNew and buildMatchPromptJson (F80)"
```

---

### Task 5: Mark F80 done in TRACKER

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1: Find and update the F80 row**

In `TRACKER.md`, find the row:

```
| F80 | Backlog | ...
```

Change `Backlog` to `✅ Done`.

- [ ] **Step 2: Commit**

```bash
git add TRACKER.md
git commit -m "chore: mark F80 done in TRACKER"
```
