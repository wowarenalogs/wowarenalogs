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
