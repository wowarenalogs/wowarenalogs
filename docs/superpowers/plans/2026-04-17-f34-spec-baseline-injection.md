# F34: Spec Baseline Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject spec-specific R1 baseline stats (CD timing + defensive timing distribution) from `benchmark_data.json` into the Claude prompt so Claude can compare the log owner's decisions against ≥2100 MMR reference data.

**Architecture:** A new `specBaselines.ts` util in `packages/shared/src/utils/` exports the `IBenchmarkData` types, a copy of `benchmark_data.json` as a typed constant, and a pure `formatSpecBaselines()` formatter. Both `CombatAIAnalysis/index.tsx` and `packages/tools/src/printMatchPrompts.ts` import from it and inject a `SPEC BASELINES` section immediately after the `PURGE RESPONSIBILITY` block in the prompt.

**Tech Stack:** TypeScript, Jest (existing `packages/shared` test suite), JSON static import (`resolveJsonModule: true` already set in root tsconfig).

---

## File Map

| File                                                                     | Status     | Purpose                                                                                       |
| ------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------- |
| `packages/shared/src/data/benchmarks.json`                               | **Create** | Copy of `packages/tools/benchmarks/benchmark_data.json` — static baseline data                |
| `packages/shared/src/utils/specBaselines.ts`                             | **Create** | Types (`IBenchmarkData`, etc.) + exported `benchmarks` constant + `formatSpecBaselines()`     |
| `packages/shared/src/utils/__tests__/specBaselines.test.ts`              | **Create** | Unit tests for `formatSpecBaselines`                                                          |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx` | **Modify** | Import `formatSpecBaselines` + `benchmarks`, inject SPEC BASELINES after PURGE RESPONSIBILITY |
| `packages/tools/src/printMatchPrompts.ts`                                | **Modify** | Same import + injection at same position (mirrors `buildMatchContext`)                        |

---

## Task 1: Copy benchmark data into shared

**Files:**

- Create: `packages/shared/src/data/benchmarks.json`

- [ ] **Step 1: Copy the file**

```bash
cp packages/tools/benchmarks/benchmark_data.json packages/shared/src/data/benchmarks.json
```

- [ ] **Step 2: Verify the copy**

```bash
wc -c packages/shared/src/data/benchmarks.json
# Expected: ~35201 bytes
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/data/benchmarks.json
git commit -m "chore: copy benchmark_data into shared/src/data for baseline injection"
```

---

## Task 2: Write failing tests for `formatSpecBaselines`

**Files:**

- Create: `packages/shared/src/utils/__tests__/specBaselines.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { IMajorCooldownInfo } from '../cooldowns';
import { formatSpecBaselines, IBenchmarkData } from '../specBaselines';

function makeCooldown(spellName: string): IMajorCooldownInfo {
  return {
    spellId: '1',
    spellName,
    tag: 'Defensive',
    cooldownSeconds: 90,
    casts: [],
    availableWindows: [],
    neverUsed: false,
  };
}

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

describe('formatSpecBaselines', () => {
  it('returns SPEC BASELINES header and defensive timing for a known spec', () => {
    const lines = formatSpecBaselines('Rogue Subtlety', [], mockData);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toBe('SPEC BASELINES — Rogue Subtlety at ≥2100 MMR (n=56):');
    expect(lines.some((l) => l.includes('Optimal 43%'))).toBe(true);
    expect(lines.some((l) => l.includes('Late 14%'))).toBe(true);
    expect(lines.some((l) => l.includes('Reactive 14%'))).toBe(true);
  });

  it('includes CD rows only for CDs present in ownerCDs', () => {
    const ownerCDs = [makeCooldown('Cloak of Shadows'), makeCooldown('Shadow Blades')];
    const lines = formatSpecBaselines('Rogue Subtlety', ownerCDs, mockData);
    // Cloak: neverUsedRate=0.393 → 61% used; medianFirstUseSeconds=94.314 → 1:34
    expect(lines.some((l) => l.includes('Cloak of Shadows') && l.includes('61% used') && l.includes('1:34'))).toBe(
      true,
    );
    // Shadow Blades: neverUsedRate=0.036 → 96% used; medianFirstUseSeconds=20.664 → 0:20
    expect(lines.some((l) => l.includes('Shadow Blades') && l.includes('96% used') && l.includes('0:20'))).toBe(true);
  });

  it('excludes CD rows for CDs not in ownerCDs', () => {
    const ownerCDs = [makeCooldown('Cloak of Shadows')];
    const lines = formatSpecBaselines('Rogue Subtlety', ownerCDs, mockData);
    expect(lines.some((l) => l.includes('Cloak of Shadows'))).toBe(true);
    expect(lines.some((l) => l.includes('Shadow Blades'))).toBe(false);
  });

  it('displays — for null medianFirstUseSeconds and p75FirstUseSeconds', () => {
    const dataWithNull: IBenchmarkData = {
      bySpec: {
        'Test Spec': {
          sampleCount: 10,
          defensiveTiming: { optimalPct: 50, earlyPct: 10, latePct: 10, reactivePct: 10, unknownPct: 20 },
          cdUsage: {
            'Some Ability': { neverUsedRate: 1, medianFirstUseSeconds: null, p75FirstUseSeconds: null },
          },
        },
      },
    };
    const lines = formatSpecBaselines('Test Spec', [makeCooldown('Some Ability')], dataWithNull);
    expect(lines.some((l) => l.includes('Some Ability') && l.includes('0% used') && l.includes('—'))).toBe(true);
  });

  it('returns empty array for an unknown spec', () => {
    expect(formatSpecBaselines('Unknown Spec', [], mockData)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm tests fail (module not found)**

```bash
npm run test --workspace=@wowarenalogs/shared -- --testPathPattern=specBaselines --no-coverage
```

Expected: FAIL — `Cannot find module '../specBaselines'`

---

## Task 3: Implement `specBaselines.ts`

**Files:**

- Create: `packages/shared/src/utils/specBaselines.ts`

- [ ] **Step 1: Create the file**

```typescript
import { fmtTime, IMajorCooldownInfo } from './cooldowns';

import benchmarksJson from '../data/benchmarks.json';

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
  };
  cdUsage: Record<string, ISpecCDBaseline>;
}

export interface IBenchmarkData {
  bySpec: Record<string, ISpecBaseline>;
}

export const benchmarks: IBenchmarkData = benchmarksJson as IBenchmarkData;

export function formatSpecBaselines(ownerSpec: string, ownerCDs: IMajorCooldownInfo[], data: IBenchmarkData): string[] {
  const spec = data.bySpec[ownerSpec];
  if (!spec) return [];

  const lines: string[] = [];
  lines.push(`SPEC BASELINES — ${ownerSpec} at ≥2100 MMR (n=${spec.sampleCount}):`);

  const dt = spec.defensiveTiming;
  lines.push(
    `  Defensive timing: Optimal ${Math.round(dt.optimalPct)}% | Early ${Math.round(dt.earlyPct)}% | Late ${Math.round(dt.latePct)}% | Reactive ${Math.round(dt.reactivePct)}% | Unknown ${Math.round(dt.unknownPct)}%`,
  );

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
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm run test --workspace=@wowarenalogs/shared -- --testPathPattern=specBaselines --no-coverage
```

Expected: PASS — 5 tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/utils/specBaselines.ts packages/shared/src/utils/__tests__/specBaselines.test.ts
git commit -m "feat: formatSpecBaselines — R1 baseline formatter for CD timing + defensive distribution"
```

---

## Task 4: Inject SPEC BASELINES into `buildMatchContext` (index.tsx)

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`

The injection goes after the PURGE RESPONSIBILITY block and before the `COOLDOWN USAGE` block. In the current file, the PURGE RESPONSIBILITY block ends with the `teamPurgers` push (around line 300); `COOLDOWN USAGE` starts at the next `lines.push('')` + `lines.push('COOLDOWN USAGE...')`.

- [ ] **Step 1: Add the import at the top of `index.tsx`**

Find the existing import block (around line 1–46). Add after the last local import:

```typescript
import { benchmarks, formatSpecBaselines } from '../../../utils/specBaselines';
```

- [ ] **Step 2: Inject the baseline section after the PURGE RESPONSIBILITY block**

Find this existing code (the end of the PURGE RESPONSIBILITY block):

```typescript
lines.push(
  teamPurgers.length > 0
    ? `  Team offensive purgers: ${teamPurgers.join(', ')}`
    : '  Team offensive purgers: None (no teammate has an offensive purge ability)',
);

// Owner cooldowns
lines.push('');
lines.push(`COOLDOWN USAGE — LOG OWNER (${ownerSpec}) — major CDs ≥30s:`);
```

Replace with:

```typescript
lines.push(
  teamPurgers.length > 0
    ? `  Team offensive purgers: ${teamPurgers.join(', ')}`
    : '  Team offensive purgers: None (no teammate has an offensive purge ability)',
);

const baselineLines = formatSpecBaselines(ownerSpec, cooldowns, benchmarks);
if (baselineLines.length > 0) {
  lines.push('');
  baselineLines.forEach((l) => lines.push(l));
}

// Owner cooldowns
lines.push('');
lines.push(`COOLDOWN USAGE — LOG OWNER (${ownerSpec}) — major CDs ≥30s:`);
```

- [ ] **Step 3: Run lint and tests**

```bash
npm run lint --workspace=@wowarenalogs/shared
npm run test --workspace=@wowarenalogs/shared -- --no-coverage
```

Expected: lint clean, all tests pass (including the 5 new specBaselines tests)

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx
git commit -m "feat: inject SPEC BASELINES section into buildMatchContext after PURGE RESPONSIBILITY"
```

---

## Task 5: Inject SPEC BASELINES into `printMatchPrompts.ts`

**Files:**

- Modify: `packages/tools/src/printMatchPrompts.ts`

`printMatchPrompts.ts` mirrors `buildMatchContext` with its own copy of the prompt-building logic. The PURGE RESPONSIBILITY block ends around line 500 and is structured identically.

- [ ] **Step 1: Add the import**

Find the existing imports block in `printMatchPrompts.ts` (around lines 25–62). Add after the last import:

```typescript
import { benchmarks, formatSpecBaselines } from '../../shared/src/utils/specBaselines';
```

- [ ] **Step 2: Inject the baseline section after the PURGE RESPONSIBILITY block**

Find this existing code in `printMatchPrompts.ts` (around line 496–503):

```typescript
lines.push(
  teamPurgers.length > 0
    ? `  Team offensive purgers: ${teamPurgers.join(', ')}`
    : '  Team offensive purgers: None (no teammate has an offensive purge ability)',
);

lines.push('');
lines.push(`COOLDOWN USAGE — LOG OWNER (${ownerSpec}) — major CDs ≥30s:`);
```

Replace with:

```typescript
lines.push(
  teamPurgers.length > 0
    ? `  Team offensive purgers: ${teamPurgers.join(', ')}`
    : '  Team offensive purgers: None (no teammate has an offensive purge ability)',
);

const baselineLines = formatSpecBaselines(ownerSpec, cooldowns, benchmarks);
if (baselineLines.length > 0) {
  lines.push('');
  baselineLines.forEach((l) => lines.push(l));
}

lines.push('');
lines.push(`COOLDOWN USAGE — LOG OWNER (${ownerSpec}) — major CDs ≥30s:`);
```

- [ ] **Step 3: Run lint**

```bash
npm run lint --workspace=@wowarenalogs/tools
```

Expected: clean (0 warnings)

- [ ] **Step 4: Smoke-test the prompt output**

```bash
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 1
```

Expected: prompt output contains a `SPEC BASELINES —` section between `PURGE RESPONSIBILITY` and `COOLDOWN USAGE` blocks. If the owner's spec has no benchmark entry, the section is silently absent — that's correct behaviour.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/printMatchPrompts.ts
git commit -m "feat: inject SPEC BASELINES section into printMatchPrompts at same position as buildMatchContext"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected: all tests pass

- [ ] **Step 2: Run full lint**

```bash
npm run lint
```

Expected: 0 warnings, 0 errors

- [ ] **Step 3: Update TRACKER.md**

In `TRACKER.md`, mark F34 status as `✅ Done` (Part 1 only — Part 2 framing bias audit remains deferred).
