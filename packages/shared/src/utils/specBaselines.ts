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
  };
  cdUsage: Record<string, ISpecCDBaseline>;
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
