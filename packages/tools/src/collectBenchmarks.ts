/* eslint-disable no-console */
/**
 * collectBenchmarks.ts — F29 Reference Benchmark Pipeline
 *
 * Downloads high-rated (≥2100 MMR) 3v3 arena matches from the public API,
 * caches raw logs locally, and extracts per-spec reference statistics:
 *   - Damage taken per 10s window distribution   → calibrates pressure thresholds
 *   - Healer HPS / DPS distribution              → calibrates healing-gap significance
 *   - Defensive CD timing distribution            → Optimal/Early/Late/Reactive baseline
 *   - CD never-used rate per spec                → flags abnormal CD avoidance
 *   - Purge rate per purge-capable spec           → calibrates dispel analysis
 *   - Match duration + dampening at death         → context for AI framing
 *
 * Output:
 *   packages/tools/benchmarks/benchmark_data.json   (committed — R1 baseline snapshot)
 *   packages/tools/benchmarks/logs/{matchId}.log    (gitignored — raw log cache)
 *   packages/tools/benchmarks/log_manifest.json     (gitignored — download manifest)
 *
 * Prerequisites:
 *   npm run build:parser      (parser must be compiled)
 *
 * Usage:
 *   npm run -w @wowarenalogs/tools start:collectBenchmarks
 *
 * Optional env vars:
 *   MATCH_COUNT=100           new matches to download per run (default 100; corpus grows across runs)
 *   BRACKET=3v3               bracket filter (default '3v3')
 *   MIN_RATING=2100           minimum rating bucket (default 2100)
 *   CONCURRENCY=5             parallel GCS downloads (default 5)
 *   MAX_LOG_AGE_DAYS=60       purge cached logs older than this (default 60)
 *   API_BASE=https://wowarenalogs.com
 */

import { CombatUnitReaction, CombatUnitType, IArenaMatch, IShuffleRound, LogEvent } from '@wowarenalogs/parser';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

import {
  annotateDefensiveTimings,
  extractMajorCooldowns,
  IEnemyCDTimelineForTiming,
} from '../../shared/src/utils/cooldowns';
import { getDampeningPercentage } from '../../shared/src/utils/dampening';
import { canOffensivePurge } from '../../shared/src/utils/dispelAnalysis';
import { reconstructEnemyCDTimeline } from '../../shared/src/utils/enemyCDs';

// ── Config ────────────────────────────────────────────────────────────────────

const MATCH_COUNT = parseInt(process.env.MATCH_COUNT ?? '100', 10);
const BRACKET = process.env.BRACKET ?? '3v3';
const MIN_RATING = parseInt(process.env.MIN_RATING ?? '2100', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '5', 10);
const MAX_LOG_AGE_DAYS = parseInt(process.env.MAX_LOG_AGE_DAYS ?? '60', 10);
const API_BASE = process.env.API_BASE ?? 'https://wowarenalogs.com';
const PAGE_SIZE = 50;
const WINDOW_SECONDS = 10;
const MIN_SAMPLES_FOR_SUMMARY = 5;

const OUTPUT_DIR = path.join(__dirname, '../benchmarks');
const LOG_CACHE_DIR = path.join(OUTPUT_DIR, 'logs');
const MANIFEST_FILE = path.join(OUTPUT_DIR, 'log_manifest.json');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'benchmark_data.json');

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchStub {
  id: string;
  wowVersion: string;
  logObjectUrl: string;
  startTime: number;
  endTime: number;
  timezone?: string;
  startInfo?: { bracket: string };
}

interface ManifestEntry {
  matchId: string;
  logObjectUrl: string;
  wowVersion: string;
  timezone?: string;
  downloadedAt: string;
  /** When the match was actually played (from API stub.startTime). Use this for patch-based pruning. */
  matchPlayedAt: string;
  logFile: string;
}

type Manifest = Record<string, ManifestEntry>;

interface TimingCounts {
  optimal: number;
  early: number;
  late: number;
  reactive: number;
  unknown: number;
}

interface SpecStats {
  sampleCount: number;
  pressureWindowsSamples: number[];
  hpsSamples: number[];
  dpsSamples: number[];
  cdFirstUse: Record<string, Array<number | null>>;
  defensiveTimings: TimingCounts & { total: number };
  purgesPerMinuteSamples: number[];
  matchDurationSamples: number[];
  dampeningAtDeathSamples: number[];
}

interface Percentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

interface CDSummary {
  neverUsedRate: number;
  medianFirstUseSeconds: number | null;
  p75FirstUseSeconds: number | null;
}

interface SpecSummary {
  sampleCount: number;
  pressureWindows: Percentiles;
  hps: Percentiles | null;
  dps: Percentiles;
  matchDuration: Percentiles;
  cdUsage: Record<string, CDSummary>;
  defensiveTiming: {
    sampleCasts: number;
    optimalPct: number;
    earlyPct: number;
    latePct: number;
    reactivePct: number;
    unknownPct: number;
  } | null;
  purgesPerMinute: Percentiles | null;
  dampeningAtDeath: Percentiles | null;
}

interface BenchmarkOutput {
  generatedAt: string;
  matchCount: number;
  bracket: string;
  minRating: number;
  corpusSize: number;
  /** Earliest and latest match play dates in the corpus — useful for checking patch coverage */
  corpusDateRange: { earliest: string; latest: string } | null;
  bySpec: Record<string, SpecSummary>;
}

type ParsedCombat = IArenaMatch | IShuffleRound;

// ── Manifest helpers ──────────────────────────────────────────────────────────

async function loadManifest(): Promise<Manifest> {
  try {
    return (await fs.readJson(MANIFEST_FILE)) as Manifest;
  } catch {
    return {};
  }
}

async function pruneManifest(manifest: Manifest): Promise<Manifest> {
  const cutoffMs = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
  const pruned: Manifest = {};
  let removed = 0;

  for (const [id, entry] of Object.entries(manifest)) {
    // Prune by match play date (patch-relevant) — fall back to downloadedAt for old entries without matchPlayedAt
    const matchDate = entry.matchPlayedAt ?? entry.downloadedAt;
    if (new Date(matchDate).getTime() < cutoffMs) {
      try {
        await fs.remove(entry.logFile);
      } catch {
        // already gone — that's fine
      }
      removed++;
    } else {
      pruned[id] = entry;
    }
  }

  if (removed > 0) console.log(`  Pruned ${removed} log(s) played > ${MAX_LOG_AGE_DAYS} days ago`);
  return pruned;
}

// ── GraphQL ───────────────────────────────────────────────────────────────────

const MATCH_STUBS_QUERY = `
  query GetLatestMatches($wowVersion: String!, $bracket: String, $minRating: Float, $offset: Int!, $count: Int!) {
    latestMatches(wowVersion: $wowVersion, bracket: $bracket, minRating: $minRating, offset: $offset, count: $count) {
      combats {
        ... on ArenaMatchDataStub {
          id wowVersion logObjectUrl startTime endTime timezone startInfo { bracket }
        }
        ... on ShuffleRoundStub {
          id wowVersion logObjectUrl startTime endTime timezone startInfo { bracket }
        }
      }
    }
  }
`;

async function fetchMatchStubs(offset: number, count: number): Promise<MatchStub[]> {
  const res = await fetch(`${API_BASE}/api/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: MATCH_STUBS_QUERY,
      variables: { wowVersion: 'retail', bracket: BRACKET, minRating: MIN_RATING as number, offset, count },
    }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status}: ${res.statusText}`);
  const json = (await res.json()) as { data?: { latestMatches?: { combats?: MatchStub[] } }; errors?: unknown[] };
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data?.latestMatches?.combats ?? [];
}

// ── Download & cache ──────────────────────────────────────────────────────────

async function downloadAndCache(stub: MatchStub): Promise<ManifestEntry> {
  const logFile = path.join(LOG_CACHE_DIR, `${stub.id}.log`);
  const res = await fetch(stub.logObjectUrl);
  if (!res.ok) throw new Error(`GCS ${res.status}: ${res.statusText}`);
  const text = await res.text();
  await fs.writeFile(logFile, text, 'utf-8');
  return {
    matchId: stub.id,
    logObjectUrl: stub.logObjectUrl,
    wowVersion: stub.wowVersion,
    timezone: stub.timezone,
    downloadedAt: new Date().toISOString(),
    matchPlayedAt: new Date(stub.startTime).toISOString(),
    logFile,
  };
}

// ── Parse ─────────────────────────────────────────────────────────────────────

async function parseLogFile(entry: ManifestEntry): Promise<ParsedCombat[]> {
  const { WoWCombatLogParser } = await import('@wowarenalogs/parser');
  const text = await fs.readFile(entry.logFile, 'utf-8');
  const lines = text.split('\n');
  const wowVersion = (entry.wowVersion as 'retail' | 'classic') ?? 'retail';
  const parser = new WoWCombatLogParser(wowVersion, entry.timezone ?? undefined);
  const combats: ParsedCombat[] = [];
  parser.on('arena_match_ended', (c: IArenaMatch) => combats.push(c));
  parser.on('solo_shuffle_ended', (m: { rounds: IShuffleRound[] }) => combats.push(...m.rounds));
  for (const line of lines) parser.parseLine(line);
  parser.flush();
  return combats;
}

// ── Stat helpers ──────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

function toPercentiles(values: number[]): Percentiles {
  const s = [...values].sort((a, b) => a - b);
  return { p50: percentile(s, 50), p75: percentile(s, 75), p90: percentile(s, 90), p95: percentile(s, 95) };
}

function loadSpellEffectData(): Record<
  string,
  { cooldownSeconds?: number; charges?: { chargeCooldownSeconds?: number }; name: string }
> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const raw = require('../../shared/src/data/spellEffects.json') as Record<
    string,
    { cooldownSeconds?: number; charges?: { chargeCooldownSeconds?: number }; name: string }
  >;
  return Object.fromEntries(
    Object.entries(raw).filter(([, v]) => {
      const cd = v.cooldownSeconds ?? v.charges?.chargeCooldownSeconds ?? 0;
      return cd >= 30;
    }),
  );
}

function specLabel(spec: string | number): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CombatUnitSpec } = require('@wowarenalogs/parser') as typeof import('@wowarenalogs/parser');
  const key = Object.keys(CombatUnitSpec).find(
    (k) => CombatUnitSpec[k as keyof typeof CombatUnitSpec] === String(spec),
  );
  return key ? key.replace('_', ' ') : `Spec ${spec}`;
}

function emptyTimingCounts(): TimingCounts & { total: number } {
  return { optimal: 0, early: 0, late: 0, reactive: 0, unknown: 0, total: 0 };
}

function ensureSpec(acc: Record<string, SpecStats>, label: string): SpecStats {
  if (!acc[label]) {
    acc[label] = {
      sampleCount: 0,
      pressureWindowsSamples: [],
      hpsSamples: [],
      dpsSamples: [],
      cdFirstUse: {},
      defensiveTimings: emptyTimingCounts(),
      purgesPerMinuteSamples: [],
      matchDurationSamples: [],
      dampeningAtDeathSamples: [],
    };
  }
  return acc[label];
}

// ── Core extraction ───────────────────────────────────────────────────────────

function extractCombatStats(
  combat: ParsedCombat,
  acc: Record<string, SpecStats>,
  _spellEffects: ReturnType<typeof loadSpellEffectData>,
): void {
  const matchStartMs = combat.startTime;
  const matchEndMs = combat.endTime;
  const durationSeconds = (matchEndMs - matchStartMs) / 1000;
  if (durationSeconds < 30) return;

  const allUnits = Object.values(combat.units);
  const friendlies = allUnits.filter(
    (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Friendly,
  );
  const enemies = allUnits.filter((u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Hostile);

  if (friendlies.length === 0 || enemies.length === 0) return;

  const owner = friendlies.find((u) => u.id === (combat as IArenaMatch).playerId) ?? friendlies[0];
  const enemyCDTimeline = reconstructEnemyCDTimeline(enemies, combat, owner, friendlies);

  const totalFriendlyDmg = friendlies
    .flatMap((f) => f.damageOut)
    .reduce((s, d) => {
      return 'effectiveAmount' in d ? s + Math.max(0, d.effectiveAmount) : s;
    }, 0);
  const avgDmgPerSec = durationSeconds > 0 ? totalFriendlyDmg / durationSeconds : 0;

  for (const unit of friendlies) {
    const label = specLabel(unit.spec);
    const stats = ensureSpec(acc, label);
    stats.sampleCount++;
    stats.matchDurationSamples.push(durationSeconds);

    // ── 1. Damage taken per WINDOW_SECONDS buckets ─────────────────────────
    const bucketCount = Math.ceil(durationSeconds / WINDOW_SECONDS);
    const buckets = new Array<number>(bucketCount).fill(0);
    for (const d of unit.damageIn) {
      const t = (d.logLine.timestamp - matchStartMs) / 1000;
      const bi = Math.min(Math.floor(t / WINDOW_SECONDS), bucketCount - 1);
      buckets[bi] += Math.abs(d.effectiveAmount);
    }
    stats.pressureWindowsSamples.push(...buckets);

    // ── 2. HPS ────────────────────────────────────────────────────────────
    const totalHeal = unit.healOut.reduce((s, h) => s + Math.max(0, h.effectiveAmount), 0);
    if (totalHeal > 0) stats.hpsSamples.push(totalHeal / durationSeconds);

    // ── 3. DPS ────────────────────────────────────────────────────────────
    stats.dpsSamples.push(avgDmgPerSec);

    // ── 4. CD usage + defensive timing annotation ─────────────────────────
    const cooldowns = extractMajorCooldowns(unit, combat);
    annotateDefensiveTimings(cooldowns, unit, combat, enemyCDTimeline as IEnemyCDTimelineForTiming);

    for (const cd of cooldowns) {
      const spellLabel = cd.spellName;
      if (!stats.cdFirstUse[spellLabel]) stats.cdFirstUse[spellLabel] = [];
      const firstCast = cd.neverUsed ? null : (cd.casts[0]?.timeSeconds ?? null);
      while (stats.cdFirstUse[spellLabel].length < stats.sampleCount - 1) {
        stats.cdFirstUse[spellLabel].push(null);
      }
      stats.cdFirstUse[spellLabel].push(firstCast);

      if (cd.tag === 'Defensive' || cd.tag === 'External') {
        for (const cast of cd.casts) {
          const timing = cast.timingLabel ?? 'Unknown';
          stats.defensiveTimings.total++;
          if (timing === 'Optimal') stats.defensiveTimings.optimal++;
          else if (timing === 'Early') stats.defensiveTimings.early++;
          else if (timing === 'Late') stats.defensiveTimings.late++;
          else if (timing === 'Reactive') stats.defensiveTimings.reactive++;
          else stats.defensiveTimings.unknown++;
        }
      }
    }

    for (const arr of Object.values(stats.cdFirstUse)) {
      while (arr.length < stats.sampleCount) arr.push(null);
    }

    // ── 5. Purge rate ─────────────────────────────────────────────────────
    if (canOffensivePurge(unit)) {
      const enemyIds = new Set(enemies.map((e) => e.id));
      const purgeCount = unit.actionOut.filter(
        (a) =>
          (a.logLine.event === LogEvent.SPELL_DISPEL || a.logLine.event === LogEvent.SPELL_STOLEN) &&
          enemyIds.has(a.destUnitId),
      ).length;
      stats.purgesPerMinuteSamples.push(purgeCount / (durationSeconds / 60));
    }

    // ── 6. Dampening at friendly deaths ───────────────────────────────────
    const bracket = (combat as IArenaMatch).startInfo?.bracket ?? '3v3';
    for (const death of unit.deathRecords) {
      const dampPct = getDampeningPercentage(bracket, allUnits, death.timestamp) / 100;
      stats.dampeningAtDeathSamples.push(dampPct);
    }
  }
}

// ── Summarise ─────────────────────────────────────────────────────────────────

function summarise(acc: Record<string, SpecStats>, processedCount: number): Record<string, SpecSummary> {
  const out: Record<string, SpecSummary> = {};

  for (const [label, stats] of Object.entries(acc)) {
    if (stats.sampleCount < MIN_SAMPLES_FOR_SUMMARY) continue;

    const cdUsage: Record<string, CDSummary> = {};
    for (const [spellLabel, timings] of Object.entries(stats.cdFirstUse)) {
      const used = timings.filter((t): t is number => t !== null);
      const sorted = [...used].sort((a, b) => a - b);
      cdUsage[spellLabel] = {
        neverUsedRate: Math.round(((timings.length - used.length) / timings.length) * 1000) / 1000,
        medianFirstUseSeconds: sorted.length > 0 ? percentile(sorted, 50) : null,
        p75FirstUseSeconds: sorted.length > 0 ? percentile(sorted, 75) : null,
      };
    }

    const dt = stats.defensiveTimings;
    const defensiveTiming =
      dt.total >= 10
        ? {
            sampleCasts: dt.total,
            optimalPct: Math.round((dt.optimal / dt.total) * 1000) / 10,
            earlyPct: Math.round((dt.early / dt.total) * 1000) / 10,
            latePct: Math.round((dt.late / dt.total) * 1000) / 10,
            reactivePct: Math.round((dt.reactive / dt.total) * 1000) / 10,
            unknownPct: Math.round((dt.unknown / dt.total) * 1000) / 10,
          }
        : null;

    out[label] = {
      sampleCount: stats.sampleCount,
      pressureWindows: toPercentiles(stats.pressureWindowsSamples),
      hps: stats.hpsSamples.length >= MIN_SAMPLES_FOR_SUMMARY ? toPercentiles(stats.hpsSamples) : null,
      dps: toPercentiles(stats.dpsSamples),
      matchDuration: toPercentiles(stats.matchDurationSamples),
      cdUsage,
      defensiveTiming,
      purgesPerMinute:
        stats.purgesPerMinuteSamples.length >= MIN_SAMPLES_FOR_SUMMARY
          ? toPercentiles(stats.purgesPerMinuteSamples)
          : null,
      dampeningAtDeath:
        stats.dampeningAtDeathSamples.length >= MIN_SAMPLES_FOR_SUMMARY
          ? toPercentiles(stats.dampeningAtDeathSamples)
          : null,
    };
  }

  void processedCount;
  return out;
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function processInBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map(fn))));
    console.log(`  downloaded ${Math.min(i + batchSize, items.length)} / ${items.length}`);
  }
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Collecting benchmark data');
  console.log(
    `  bracket=${BRACKET}  minRating=${MIN_RATING}  newMatchTarget=${MATCH_COUNT}  maxAge=${MAX_LOG_AGE_DAYS}d`,
  );
  console.log();

  await fs.ensureDir(LOG_CACHE_DIR);

  // 1. Load and prune manifest
  console.log('Loading log manifest...');
  let manifest = await loadManifest();
  manifest = await pruneManifest(manifest);
  const cachedIds = new Set(Object.keys(manifest));
  console.log(`  ${cachedIds.size} log(s) already cached`);

  // 2. Fetch stubs, skip already-cached
  console.log('\nFetching match stubs...');
  const newStubs: MatchStub[] = [];
  let offset = 0;
  while (newStubs.length < MATCH_COUNT) {
    const page = await fetchMatchStubs(offset, PAGE_SIZE);
    if (page.length === 0) break;
    for (const stub of page) {
      if (!cachedIds.has(stub.id)) newStubs.push(stub);
      if (newStubs.length >= MATCH_COUNT) break;
    }
    offset += page.length;
    if (page.length < PAGE_SIZE) break;
  }
  console.log(`  ${newStubs.length} new stub(s) to download (${cachedIds.size} already cached)`);

  // 3. Download and cache new logs
  if (newStubs.length > 0) {
    console.log(`\nDownloading new logs (concurrency=${CONCURRENCY})...`);
    let downloadFailed = 0;
    await processInBatches(newStubs, CONCURRENCY, async (stub) => {
      try {
        const entry = await downloadAndCache(stub);
        manifest[stub.id] = entry;
      } catch (err) {
        console.warn(`  WARN: ${stub.id}: ${err}`);
        downloadFailed++;
      }
    });
    if (downloadFailed > 0) console.log(`  ${downloadFailed} download(s) failed`);

    // Save updated manifest
    await fs.writeJson(MANIFEST_FILE, manifest, { spaces: 2 });
    console.log(`  Manifest saved (${Object.keys(manifest).length} total entries)`);
  }

  // 4. Process ALL cached logs
  const allEntries = Object.values(manifest);
  console.log(`\nProcessing ${allEntries.length} cached log(s)...`);
  const spellEffects = loadSpellEffectData();
  const acc: Record<string, SpecStats> = {};
  let processed = 0;
  let parseFailed = 0;

  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    try {
      const combats = await parseLogFile(entry);
      for (const combat of combats) extractCombatStats(combat, acc, spellEffects);
      processed++;
    } catch (err) {
      console.warn(`  WARN: ${entry.matchId}: ${err}`);
      parseFailed++;
    }
    if ((i + 1) % 50 === 0) console.log(`  parsed ${i + 1} / ${allEntries.length}`);
  }

  console.log(`\nProcessed: ${processed}  Failed: ${parseFailed}`);
  console.log(`Unique specs: ${Object.keys(acc).length}`);

  // 5. Summarise and write
  const bySpec = summarise(acc, processed);
  const playedDates = allEntries
    .map((e) => e.matchPlayedAt ?? e.downloadedAt)
    .filter(Boolean)
    .sort();
  const corpusDateRange =
    playedDates.length > 0 ? { earliest: playedDates[0], latest: playedDates[playedDates.length - 1] } : null;

  const output: BenchmarkOutput = {
    generatedAt: new Date().toISOString(),
    matchCount: processed,
    bracket: BRACKET,
    minRating: MIN_RATING,
    corpusSize: allEntries.length,
    corpusDateRange,
    bySpec,
  };

  await fs.writeJson(OUTPUT_FILE, output, { spaces: 2 });
  console.log(`\nOutput → ${OUTPUT_FILE}`);

  // 6. Console summary
  console.log('\n── Pressure P90 (dmg/10s) ──────────────────────────────────────────');
  for (const [spec, s] of Object.entries(bySpec).sort((a, b) => b[1].sampleCount - a[1].sampleCount)) {
    const p90 = Math.round(s.pressureWindows.p90 / 1000);
    const hpsStr = s.hps ? `  HPS p50: ${Math.round(s.hps.p50 / 1000)}k` : '';
    const durStr = `  matchDur p50: ${Math.round(s.matchDuration.p50)}s`;
    console.log(`  ${spec.padEnd(30)} n=${String(s.sampleCount).padEnd(4)} P90: ${p90}k${hpsStr}${durStr}`);
  }

  console.log('\n── Defensive timing (% of casts) ───────────────────────────────────');
  for (const [spec, s] of Object.entries(bySpec).sort((a, b) => b[1].sampleCount - a[1].sampleCount)) {
    if (!s.defensiveTiming) continue;
    const dt = s.defensiveTiming;
    console.log(
      `  ${spec.padEnd(30)} Optimal: ${String(dt.optimalPct).padEnd(5)}%  Early: ${String(dt.earlyPct).padEnd(5)}%  Late: ${String(dt.latePct).padEnd(5)}%  Reactive: ${String(dt.reactivePct).padEnd(5)}%  Unknown: ${dt.unknownPct}%  (n=${dt.sampleCasts} casts)`,
    );
  }

  console.log('\n── Purge rate (purges/min) ─────────────────────────────────────────');
  for (const [spec, s] of Object.entries(bySpec)) {
    if (!s.purgesPerMinute) continue;
    const p = s.purgesPerMinute;
    console.log(`  ${spec.padEnd(30)} p50: ${p.p50.toFixed(1)}  p75: ${p.p75.toFixed(1)}  p90: ${p.p90.toFixed(1)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
