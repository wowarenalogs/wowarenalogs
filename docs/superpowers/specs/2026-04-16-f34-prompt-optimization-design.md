# F34: Spec Baseline Injection — Design Spec

**Date:** 2026-04-16
**Tracker item:** F34 (Sprint 2 — Prompt optimization)
**Scope:** Part 1 only — inject spec-specific R1 baselines into the Claude prompt. Part 2 (framing bias audit) is deferred until baseline output is live and can be analyzed.

---

## Problem

Claude has no reference point for what "normal" R1 play looks like for a given spec. When it sees "Cloak of Shadows used at 1:34," it can't distinguish early, typical, or late — it has no baseline. `benchmark_data.json` collects exactly this data from ≥2100 MMR public matches but is currently not injected into the prompt anywhere.

---

## Decision Summary

| Question      | Decision                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope         | Owner spec only                                                                                                                              |
| Metrics       | CD timing (neverUsedRate, medianFirstUseSeconds, p75FirstUseSeconds) + defensive timing distribution (Optimal/Early/Late/Reactive/Unknown %) |
| Placement     | User message — `SPEC BASELINES` section in `buildMatchContext` output                                                                        |
| Data sourcing | Copy `benchmark_data.json` to `packages/shared/src/data/benchmarks.json`; import directly                                                    |

---

## Architecture

### Data file

`packages/shared/src/data/benchmarks.json` — new file, copied from `packages/tools/benchmarks/benchmark_data.json`.

Both files carry a comment noting they must be kept in sync when the benchmark pipeline is re-run. The file is 35KB covering 22 specs.

### Types (inline in `index.tsx`)

```ts
interface SpecCDBaseline {
  neverUsedRate: number;
  medianFirstUseSeconds: number | null;
  p75FirstUseSeconds: number | null;
}
interface SpecBaseline {
  sampleCount: number;
  defensiveTiming: {
    optimalPct: number;
    earlyPct: number;
    latePct: number;
    reactivePct: number;
    unknownPct: number;
  };
  cdUsage: Record<string, SpecCDBaseline>;
}
interface BenchmarkData {
  bySpec: Record<string, SpecBaseline>;
}
```

### Formatter

`formatSpecBaselines(ownerSpec: string, ownerCDs: MajorCD[], benchmarks: BenchmarkData): string[]`

- Returns `[]` if `ownerSpec` not found in benchmark data — silent no-op, no throw.
- Only emits CD rows for CDs that appear in the owner's actual `ownerCDs` array. No point showing baseline data for CDs not present in the log.
- Output format:

```
SPEC BASELINES — Rogue Subtlety at ≥2100 MMR (n=56):
  Defensive timing: Optimal 43% | Early 11% | Late 14% | Reactive 14% | Unknown 19%
  CD reference (% of matches used | median first use | p75 first use):
    Shadow Blades:     96% used | 0:21 median | 0:35 p75
    Cloak of Shadows:  39% used | 1:34 median | 2:02 p75
    Kidney Shot:      100% used | 0:21 median | 0:30 p75
```

### Injection point

In `buildMatchContext`, immediately after the `PURGE RESPONSIBILITY` block and before `COOLDOWN USAGE — LOG OWNER`. The baselines frame the CD section they contextualize.

### Files changed

| File                                                                     | Change                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `packages/shared/src/data/benchmarks.json`                               | New file — copy of tools benchmark output                           |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx` | Add types, `formatSpecBaselines`, inject after PURGE RESPONSIBILITY |
| `packages/tools/src/printMatchPrompts.ts`                                | Same injection at same position (mirrors buildMatchContext)         |

---

## Error Handling

- Unknown spec → `formatSpecBaselines` returns `[]`, section omitted. Same pattern as other conditional sections (e.g., healer-only blocks).
- Null `medianFirstUseSeconds` / `p75FirstUseSeconds` → display `—` instead of a number.

---

## Testing

Two unit tests added to `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/index.test.ts`:

1. Known spec with matching CDs → output contains `SPEC BASELINES`, correct CD names, correct % values
2. Unknown spec → returns `[]`

---

## Out of Scope

**F34 Part 2 — Prompt framing bias audit** (context order, blame anchoring): deferred. Best evaluated after baseline injection is live and real Claude output can be audited for anchoring patterns.
