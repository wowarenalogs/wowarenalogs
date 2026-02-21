/* eslint-disable no-console */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { WoWCombatLogParser } from '../dist/index.js';

type ParserEventPayload = unknown;

interface ParserErrorPayload {
  message?: string;
  name?: string;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_SUITE = 'default';
const DEFAULT_OUTPUT_DIR = path.resolve(ROOT_DIR, 'perf/results');
const DEFAULT_SUITES_PATH = path.resolve(ROOT_DIR, 'perf/suites.json');
const DEFAULT_CONFIG_PATH = path.resolve(ROOT_DIR, 'perf/configs/default.json');

interface RunnerConfig {
  suite: string;
  suitesPath: string;
  fixture: string | null;
  snapshot: string | null;
  timezone: string | null;
  outputDir: string;
  updateSnapshots: boolean;
  skipCompare: boolean;
  iterations: number;
  warmup: number;
  measureMemory: boolean;
  runs: number;
}

interface CliOptions {
  configPath: string | null;
  overrides: Partial<RunnerConfig>;
  help: boolean;
}

interface SuiteFixture {
  id: string;
  input: string;
  snapshot: string;
}

interface SuiteConfig {
  timezone?: string;
  fixtures: SuiteFixture[];
}

type SuitesManifest = Record<string, SuiteConfig>;

interface WorkItem {
  id: string;
  input: string;
  snapshot: string | null;
  timezone: string | null;
}

interface ParsedResult {
  combats: ParserEventPayload[];
  malformedCombats: ParserEventPayload[];
  shuffleRounds: ParserEventPayload[];
  shuffles: ParserEventPayload[];
  activityStarts: ParserEventPayload[];
  battlegrounds: ParserEventPayload[];
  parserErrors: Array<{ message: string; name: string }>;
}

interface SnapshotRecord {
  algorithm: 'sha256';
  hash: string;
  bytes: number;
  input: string;
  timezone: string | null;
  counts: {
    combats: number;
    malformedCombats: number;
    shuffleRounds: number;
    shuffles: number;
    activityStarts: number;
    battlegrounds: number;
    parserErrors: number;
  };
}

interface IterationResult {
  wallMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  memory: { start: NodeJS.MemoryUsage; end: NodeJS.MemoryUsage; peak: NodeJS.MemoryUsage } | null;
}

interface FixtureRunResult {
  id: string;
  input: string;
  snapshot: string | null;
  timezone: string | null;
  snapshotRecord: SnapshotRecord;
  iterations: IterationResult[];
}

interface SummaryStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
}

type AggregateStats = Omit<SummaryStats, 'p95'>;
type MemoryStatKey = 'rss' | 'heapTotal' | 'heapUsed' | 'external' | 'arrayBuffers';

const MEMORY_STAT_KEYS: MemoryStatKey[] = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'];

interface RunFixtureSummary {
  id: string;
  wallMs: SummaryStats;
  cpuUserMs: SummaryStats;
  cpuSystemMs: SummaryStats;
  memoryDelta: Record<MemoryStatKey, SummaryStats> | null;
  memoryPeakDelta: Record<MemoryStatKey, SummaryStats> | null;
}

interface FixtureAggregate {
  id: string;
  runs: number;
  wallMs: AggregateStats;
  cpuUserMs: AggregateStats;
  cpuSystemMs: AggregateStats;
  memoryDelta: Record<MemoryStatKey, AggregateStats> | null;
  memoryPeakDelta: Record<MemoryStatKey, AggregateStats> | null;
}

interface RunOutput {
  runId: string;
  node: string;
  platform: NodeJS.Platform;
  arch: string;
  config: RunnerConfig;
  runs: Array<{
    runIndex: number;
    results: FixtureRunResult[];
  }>;
  aggregateByFixture: FixtureAggregate[];
}

const DEFAULT_CONFIG: RunnerConfig = {
  suite: DEFAULT_SUITE,
  suitesPath: path.relative(ROOT_DIR, DEFAULT_SUITES_PATH),
  fixture: null,
  snapshot: null,
  timezone: null,
  outputDir: DEFAULT_OUTPUT_DIR,
  updateSnapshots: false,
  skipCompare: false,
  iterations: 1,
  warmup: 0,
  measureMemory: false,
  runs: 1,
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    configPath: null,
    overrides: {},
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--config' && next) {
      options.configPath = path.resolve(process.cwd(), next);
      i += 1;
    } else if (arg === '--suite' && next) {
      options.overrides.suite = next;
      i += 1;
    } else if (arg === '--suites' && next) {
      options.overrides.suitesPath = next;
      i += 1;
    } else if (arg === '--fixture' && next) {
      options.overrides.fixture = next;
      i += 1;
    } else if (arg === '--snapshot' && next) {
      options.overrides.snapshot = next;
      i += 1;
    } else if (arg === '--timezone' && next) {
      options.overrides.timezone = next;
      i += 1;
    } else if (arg === '--output-dir' && next) {
      options.overrides.outputDir = next;
      i += 1;
    } else if (arg === '--iterations' && next) {
      options.overrides.iterations = Number(next);
      i += 1;
    } else if (arg === '--warmup' && next) {
      options.overrides.warmup = Number(next);
      i += 1;
    } else if (arg === '--runs' && next) {
      options.overrides.runs = Number(next);
      i += 1;
    } else if (arg === '--update-snapshots') {
      options.overrides.updateSnapshots = true;
    } else if (arg === '--skip-compare') {
      options.overrides.skipCompare = true;
    } else if (arg === '--measure-memory') {
      options.overrides.measureMemory = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolvePath(relOrAbs: string | null): string | null {
  if (!relOrAbs) return null;
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.resolve(ROOT_DIR, relOrAbs);
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function maybeGc(): void {
  if (typeof global.gc === 'function') {
    global.gc();
  }
}

function parseJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadConfig(configPath: string | null): RunnerConfig {
  let fileConfig: Partial<RunnerConfig> = {};

  if (configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    fileConfig = parseJsonFile(configPath) as Partial<RunnerConfig>;
  }

  const merged: RunnerConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
  };

  const resolvedOutputDir = resolvePath(merged.outputDir);
  const resolvedSuitesPath = resolvePath(merged.suitesPath);

  if (!resolvedOutputDir || !resolvedSuitesPath) {
    throw new Error('Invalid config paths');
  }

  merged.outputDir = resolvedOutputDir;
  merged.suitesPath = resolvedSuitesPath;

  return merged;
}

function applyOverrides(config: RunnerConfig, overrides: Partial<RunnerConfig>): RunnerConfig {
  const merged: RunnerConfig = {
    ...config,
    ...overrides,
  };

  const resolvedOutputDir = resolvePath(merged.outputDir);
  const resolvedSuitesPath = resolvePath(merged.suitesPath);

  if (!resolvedOutputDir || !resolvedSuitesPath) {
    throw new Error('Invalid override paths');
  }

  merged.outputDir = resolvedOutputDir;
  merged.suitesPath = resolvedSuitesPath;
  return merged;
}

function validateConfig(config: RunnerConfig): void {
  if (!Number.isFinite(config.iterations) || config.iterations < 1) {
    throw new Error('`iterations` must be a positive number');
  }
  if (!Number.isFinite(config.warmup) || config.warmup < 0) {
    throw new Error('`warmup` must be a non-negative number');
  }
  if (!Number.isFinite(config.runs) || config.runs < 1) {
    throw new Error('`runs` must be a positive number');
  }
}

function loadSuites(suitesPath: string): SuitesManifest {
  if (!fs.existsSync(suitesPath)) {
    throw new Error(`Missing suite manifest: ${suitesPath}`);
  }
  return parseJsonFile(suitesPath) as SuitesManifest;
}

function computeStableHash(value: unknown): string {
  const hash = crypto.createHash('sha256');
  const seen = new WeakSet<object>();

  function update(str: string): void {
    hash.update(str);
  }

  function walk(currentValue: unknown): void {
    if (currentValue === null) {
      update('null;');
      return;
    }

    const type = typeof currentValue;
    if (type === 'string') {
      update(`str:${JSON.stringify(currentValue)};`);
      return;
    }
    if (type === 'number') {
      if (!Number.isFinite(currentValue)) {
        update('num:null;');
      } else {
        update(`num:${currentValue};`);
      }
      return;
    }
    if (type === 'boolean') {
      update(`bool:${currentValue};`);
      return;
    }
    if (type === 'bigint') {
      const bigintValue = currentValue as bigint;
      update(`big:${bigintValue.toString()};`);
      return;
    }
    if (type === 'undefined') {
      update('undef;');
      return;
    }
    if (type === 'symbol' || type === 'function') {
      update('null;');
      return;
    }

    const objectValue = currentValue as object;
    if (seen.has(objectValue)) {
      update('[Circular];');
      return;
    }
    seen.add(objectValue);

    if (Array.isArray(currentValue)) {
      update('[;');
      currentValue.forEach((item) => {
        walk(item);
        update(',;');
      });
      update('];');
      seen.delete(objectValue);
      return;
    }

    if (currentValue instanceof Date) {
      update(`date:${currentValue.toISOString()};`);
      seen.delete(objectValue);
      return;
    }

    if (Buffer.isBuffer(currentValue)) {
      update(`buf:${currentValue.toString('hex')};`);
      seen.delete(objectValue);
      return;
    }

    update('{;');
    Object.keys(currentValue as Record<string, unknown>)
      .sort()
      .forEach((key) => {
        const child = (currentValue as Record<string, unknown>)[key];
        if (typeof child === 'undefined' || typeof child === 'function' || typeof child === 'symbol') {
          return;
        }
        update(`key:${JSON.stringify(key)};`);
        walk(child);
        update(',;');
      });
    update('};');
    seen.delete(objectValue);
  }

  walk(value);
  return hash.digest('hex');
}

function readSnapshotHash(snapshotPath: string): string | null {
  const content = fs.readFileSync(snapshotPath, 'utf8').trim();
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as { hash?: unknown };
    if (typeof parsed.hash === 'string') {
      return parsed.hash;
    }
  } catch (_error) {
    // Fall back to plain text hash for backward compatibility.
  }

  return content;
}

function readLogLines(inputPath: string): string[] {
  const content = fs.readFileSync(inputPath, 'utf8');
  return content.split('\n');
}

function parseLog(inputPath: string, timezone: string | null, onLineParsed?: () => void): ParsedResult {
  const parser = new WoWCombatLogParser(null, timezone ?? undefined);
  const parsed: ParsedResult = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
    activityStarts: [],
    battlegrounds: [],
    parserErrors: [],
  };

  parser.on('arena_match_ended', (data) => parsed.combats.push(data));
  parser.on('malformed_arena_match_detected', (data) => parsed.malformedCombats.push(data));
  parser.on('solo_shuffle_round_ended', (data) => parsed.shuffleRounds.push(data));
  parser.on('solo_shuffle_ended', (data) => parsed.shuffles.push(data));
  parser.on('activity_started', (data) => parsed.activityStarts.push(data));
  parser.on('battleground_ended', (data) => parsed.battlegrounds.push(data));
  parser.on('parser_error', (error) => {
    const typedError = error as ParserErrorPayload;
    parsed.parserErrors.push({
      message: typedError.message ?? 'Unknown parser error',
      name: typedError.name ?? 'Error',
    });
  });

  const lines = readLogLines(inputPath);
  lines.forEach((line) => {
    parser.parseLine(line);
    onLineParsed?.();
  });
  parser.flush();
  onLineParsed?.();

  return parsed;
}

function buildSnapshotRecord(parsed: ParsedResult, inputPath: string, timezone: string | null): SnapshotRecord {
  const serialized = JSON.stringify(parsed);
  return {
    algorithm: 'sha256',
    hash: computeStableHash(parsed),
    bytes: Buffer.byteLength(serialized, 'utf8'),
    input: inputPath,
    timezone,
    counts: {
      combats: parsed.combats.length,
      malformedCombats: parsed.malformedCombats.length,
      shuffleRounds: parsed.shuffleRounds.length,
      shuffles: parsed.shuffles.length,
      activityStarts: parsed.activityStarts.length,
      battlegrounds: parsed.battlegrounds.length,
      parserErrors: parsed.parserErrors.length,
    },
  };
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function printMemoryStats(start: NodeJS.MemoryUsage, end: NodeJS.MemoryUsage, peak: NodeJS.MemoryUsage): void {
  const keys: Array<keyof NodeJS.MemoryUsage> = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'];
  keys.forEach((key) => {
    const delta = end[key] - start[key];
    const peakDelta = peak[key] - start[key];
    const deltaPrefix = delta >= 0 ? '+' : '-';
    const peakDeltaPrefix = peakDelta >= 0 ? '+' : '-';
    console.log(
      `  ${key}: start=${formatBytes(start[key])} end=${formatBytes(end[key])} peak=${formatBytes(
        peak[key],
      )} delta=${deltaPrefix}${formatBytes(Math.abs(delta))} peakDelta=${peakDeltaPrefix}${formatBytes(
        Math.abs(peakDelta),
      )}`,
    );
  });
}

function statsFrom(values: number[]): SummaryStats {
  if (!values.length) {
    throw new Error('Cannot compute stats from empty values');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median,
    p95,
  };
}

function printHelp(): void {
  console.log('Parse combat logs, compare snapshots, and collect perf metrics.');
  console.log('');
  console.log('Usage:');
  console.log('  npx ts-node scripts/perf-runner.ts [options]');
  console.log('');
  console.log('Recommended: place settings in a config JSON and use --config.');
  console.log('');
  console.log('Options:');
  console.log('  --config <path>       Runner config file (default: perf/configs/default.json)');
  console.log('  --runs <n>            Number of full suite runs');
  console.log('  --iterations <n>      Iterations per fixture within each run');
  console.log('  --warmup <n>          Warmup iterations before measured iterations');
  console.log('  --suite <name>        Suite from suites manifest');
  console.log('  --suites <path>       Suite manifest path');
  console.log('  --fixture <path>      Run a single fixture instead of a suite');
  console.log('  --snapshot <path>     Snapshot path when using --fixture');
  console.log('  --timezone <tz>       Timezone override');
  console.log('  --output-dir <path>   Directory for perf results JSON');
  console.log('  --update-snapshots    Replace snapshots with current output');
  console.log('  --skip-compare        Skip snapshot compare');
  console.log('  --measure-memory      Print process memory before/after each run');
  console.log('  -h, --help            Show this help');
}

function resolveWorkItems(config: RunnerConfig, suites: SuitesManifest): WorkItem[] {
  if (config.fixture) {
    return [
      {
        id: path.basename(config.fixture, path.extname(config.fixture)),
        input: config.fixture,
        snapshot: config.snapshot,
        timezone: config.timezone,
      },
    ];
  }

  const suite = suites[config.suite];
  if (!suite) {
    throw new Error(`Unknown suite: ${config.suite}`);
  }

  return suite.fixtures.map((fixture) => ({
    id: fixture.id,
    input: fixture.input,
    snapshot: fixture.snapshot,
    timezone: config.timezone || suite.timezone || null,
  }));
}

function runFixture(fixture: WorkItem, config: RunnerConfig, updateSnapshots: boolean): FixtureRunResult {
  const inputPath = resolvePath(fixture.input);
  const snapshotPath = resolvePath(fixture.snapshot);
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`Missing input file: ${inputPath}`);
  }

  const iterations: IterationResult[] = [];
  let snapshotRecord: SnapshotRecord | null = null;

  for (let i = 0; i < config.warmup; i += 1) {
    maybeGc();
    parseLog(inputPath, fixture.timezone);
  }

  for (let i = 0; i < config.iterations; i += 1) {
    maybeGc();
    const memStart = config.measureMemory ? process.memoryUsage() : null;
    const memPeak = memStart ? { ...memStart } : null;
    const capturePeakMemory = (): void => {
      if (!memPeak) {
        return;
      }
      const sample = process.memoryUsage();
      MEMORY_STAT_KEYS.forEach((key) => {
        if (sample[key] > memPeak[key]) {
          memPeak[key] = sample[key];
        }
      });
    };
    const wallStart = process.hrtime.bigint();
    const cpuStart = process.cpuUsage();

    const parsed = parseLog(inputPath, fixture.timezone, capturePeakMemory);

    const wallEnd = process.hrtime.bigint();
    const cpuDiff = process.cpuUsage(cpuStart);
    const memEnd = config.measureMemory ? process.memoryUsage() : null;
    capturePeakMemory();

    if (!snapshotRecord) {
      snapshotRecord = buildSnapshotRecord(parsed, fixture.input, fixture.timezone);
    }

    iterations.push({
      wallMs: Number(wallEnd - wallStart) / 1e6,
      cpuUserMs: cpuDiff.user / 1000,
      cpuSystemMs: cpuDiff.system / 1000,
      memory: memStart && memEnd && memPeak ? { start: memStart, end: memEnd, peak: memPeak } : null,
    });
  }

  if (!snapshotRecord) {
    throw new Error(`No snapshot generated for ${fixture.id}`);
  }

  if (updateSnapshots) {
    if (!snapshotPath) {
      throw new Error('Missing snapshot path for --update-snapshots');
    }
    ensureParentDir(snapshotPath);
    fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshotRecord, null, 2)}\n`, 'utf8');
    console.log(`Updated snapshot: ${snapshotPath}`);
  } else if (snapshotPath && !config.skipCompare) {
    if (!fs.existsSync(snapshotPath)) {
      throw new Error(`Snapshot not found: ${snapshotPath}`);
    }
    const expectedHash = readSnapshotHash(snapshotPath);
    if (expectedHash !== snapshotRecord.hash) {
      throw new Error(`Snapshot mismatch for ${fixture.id}. Expected ${expectedHash}, got ${snapshotRecord.hash}.`);
    }
  } else if (!snapshotPath) {
    console.log(`No snapshot specified for ${fixture.id}; skipping compare.`);
  } else if (config.skipCompare) {
    console.log(`Snapshot compare skipped for ${fixture.id}.`);
  }

  return {
    id: fixture.id,
    input: fixture.input,
    snapshot: fixture.snapshot || null,
    timezone: fixture.timezone,
    snapshotRecord,
    iterations,
  };
}

function summarizeFixtureRun(result: FixtureRunResult): RunFixtureSummary {
  const memoryIterations = result.iterations.filter(
    (
      item,
    ): item is IterationResult & {
      memory: { start: NodeJS.MemoryUsage; end: NodeJS.MemoryUsage; peak: NodeJS.MemoryUsage };
    } => item.memory !== null,
  );
  let memoryDelta: Record<MemoryStatKey, SummaryStats> | null = null;
  let memoryPeakDelta: Record<MemoryStatKey, SummaryStats> | null = null;

  if (memoryIterations.length > 0) {
    memoryDelta = {
      rss: statsFrom(memoryIterations.map((item) => item.memory.end.rss - item.memory.start.rss)),
      heapTotal: statsFrom(memoryIterations.map((item) => item.memory.end.heapTotal - item.memory.start.heapTotal)),
      heapUsed: statsFrom(memoryIterations.map((item) => item.memory.end.heapUsed - item.memory.start.heapUsed)),
      external: statsFrom(memoryIterations.map((item) => item.memory.end.external - item.memory.start.external)),
      arrayBuffers: statsFrom(
        memoryIterations.map((item) => item.memory.end.arrayBuffers - item.memory.start.arrayBuffers),
      ),
    };
    memoryPeakDelta = {
      rss: statsFrom(memoryIterations.map((item) => item.memory.peak.rss - item.memory.start.rss)),
      heapTotal: statsFrom(memoryIterations.map((item) => item.memory.peak.heapTotal - item.memory.start.heapTotal)),
      heapUsed: statsFrom(memoryIterations.map((item) => item.memory.peak.heapUsed - item.memory.start.heapUsed)),
      external: statsFrom(memoryIterations.map((item) => item.memory.peak.external - item.memory.start.external)),
      arrayBuffers: statsFrom(
        memoryIterations.map((item) => item.memory.peak.arrayBuffers - item.memory.start.arrayBuffers),
      ),
    };
  }

  return {
    id: result.id,
    wallMs: statsFrom(result.iterations.map((item) => item.wallMs)),
    cpuUserMs: statsFrom(result.iterations.map((item) => item.cpuUserMs)),
    cpuSystemMs: statsFrom(result.iterations.map((item) => item.cpuSystemMs)),
    memoryDelta,
    memoryPeakDelta,
  };
}

function printFixtureSummary(result: FixtureRunResult): void {
  const summary = summarizeFixtureRun(result);

  console.log(`Fixture: ${result.id}`);
  console.log(
    `  wall ms (min/median/p95/max): ${summary.wallMs.min.toFixed(2)} / ${summary.wallMs.median.toFixed(2)} / ${summary.wallMs.p95.toFixed(2)} / ${summary.wallMs.max.toFixed(2)}`,
  );
  console.log(
    `  cpu user ms (min/median/p95/max): ${summary.cpuUserMs.min.toFixed(2)} / ${summary.cpuUserMs.median.toFixed(2)} / ${summary.cpuUserMs.p95.toFixed(2)} / ${summary.cpuUserMs.max.toFixed(2)}`,
  );
  console.log(
    `  cpu sys ms (min/median/p95/max): ${summary.cpuSystemMs.min.toFixed(2)} / ${summary.cpuSystemMs.median.toFixed(2)} / ${summary.cpuSystemMs.p95.toFixed(2)} / ${summary.cpuSystemMs.max.toFixed(2)}`,
  );

  if (result.iterations[0].memory) {
    console.log('  memory usage per iteration (start -> end):');
    result.iterations.forEach((entry, index) => {
      if (!entry.memory) {
        return;
      }
      console.log(`  iteration ${index + 1}:`);
      printMemoryStats(entry.memory.start, entry.memory.end, entry.memory.peak);
    });
  }
}

function aggregateAcrossRuns(allRuns: FixtureRunResult[][]): FixtureAggregate[] {
  const grouped = new Map<
    string,
    {
      wallMean: number[];
      cpuUserMean: number[];
      cpuSystemMean: number[];
      memoryDeltaMeanByKey: Record<MemoryStatKey, number[]>;
      memoryPeakDeltaMeanByKey: Record<MemoryStatKey, number[]>;
    }
  >();

  allRuns.forEach((runResults) => {
    runResults.forEach((result) => {
      const summary = summarizeFixtureRun(result);
      if (!grouped.has(result.id)) {
        grouped.set(result.id, {
          wallMean: [],
          cpuUserMean: [],
          cpuSystemMean: [],
          memoryDeltaMeanByKey: {
            rss: [],
            heapTotal: [],
            heapUsed: [],
            external: [],
            arrayBuffers: [],
          },
          memoryPeakDeltaMeanByKey: {
            rss: [],
            heapTotal: [],
            heapUsed: [],
            external: [],
            arrayBuffers: [],
          },
        });
      }

      const entry = grouped.get(result.id);
      if (!entry) {
        return;
      }

      entry.wallMean.push(summary.wallMs.mean);
      entry.cpuUserMean.push(summary.cpuUserMs.mean);
      entry.cpuSystemMean.push(summary.cpuSystemMs.mean);
      if (summary.memoryDelta) {
        const memoryDelta = summary.memoryDelta;
        MEMORY_STAT_KEYS.forEach((key) => {
          entry.memoryDeltaMeanByKey[key].push(memoryDelta[key].mean);
        });
      }
      if (summary.memoryPeakDelta) {
        const memoryPeakDelta = summary.memoryPeakDelta;
        MEMORY_STAT_KEYS.forEach((key) => {
          entry.memoryPeakDeltaMeanByKey[key].push(memoryPeakDelta[key].mean);
        });
      }
    });
  });

  return Array.from(grouped.entries()).map(([id, values]) => {
    const wall = statsFrom(values.wallMean);
    const cpuUser = statsFrom(values.cpuUserMean);
    const cpuSystem = statsFrom(values.cpuSystemMean);
    const hasMemory = MEMORY_STAT_KEYS.every((key) => values.memoryDeltaMeanByKey[key].length > 0);
    const hasPeakMemory = MEMORY_STAT_KEYS.every((key) => values.memoryPeakDeltaMeanByKey[key].length > 0);
    const memoryDelta = hasMemory
      ? {
          rss: (() => {
            const value = statsFrom(values.memoryDeltaMeanByKey.rss);
            return { min: value.min, max: value.max, mean: value.mean, median: value.median };
          })(),
          heapTotal: (() => {
            const value = statsFrom(values.memoryDeltaMeanByKey.heapTotal);
            return { min: value.min, max: value.max, mean: value.mean, median: value.median };
          })(),
          heapUsed: (() => {
            const value = statsFrom(values.memoryDeltaMeanByKey.heapUsed);
            return { min: value.min, max: value.max, mean: value.mean, median: value.median };
          })(),
          external: (() => {
            const value = statsFrom(values.memoryDeltaMeanByKey.external);
            return { min: value.min, max: value.max, mean: value.mean, median: value.median };
          })(),
          arrayBuffers: (() => {
            const value = statsFrom(values.memoryDeltaMeanByKey.arrayBuffers);
            return { min: value.min, max: value.max, mean: value.mean, median: value.median };
          })(),
        }
      : null;
    const memoryPeakDelta = hasPeakMemory
      ? {
          rss: (() => {
            const value = statsFrom(values.memoryPeakDeltaMeanByKey.rss);
            return { min: value.min, max: value.max, mean: value.mean, median: value.median };
          })(),
          heapTotal: (() => {
            const value = statsFrom(values.memoryPeakDeltaMeanByKey.heapTotal);
            return { min: value.min, max: value.max, mean: value.mean, median: value.median };
          })(),
          heapUsed: (() => {
            const value = statsFrom(values.memoryPeakDeltaMeanByKey.heapUsed);
            return { min: value.min, max: value.max, mean: value.mean, median: value.median };
          })(),
          external: (() => {
            const value = statsFrom(values.memoryPeakDeltaMeanByKey.external);
            return { min: value.min, max: value.max, mean: value.mean, median: value.median };
          })(),
          arrayBuffers: (() => {
            const value = statsFrom(values.memoryPeakDeltaMeanByKey.arrayBuffers);
            return { min: value.min, max: value.max, mean: value.mean, median: value.median };
          })(),
        }
      : null;

    return {
      id,
      runs: values.wallMean.length,
      wallMs: {
        min: wall.min,
        max: wall.max,
        mean: wall.mean,
        median: wall.median,
      },
      cpuUserMs: {
        min: cpuUser.min,
        max: cpuUser.max,
        mean: cpuUser.mean,
        median: cpuUser.median,
      },
      cpuSystemMs: {
        min: cpuSystem.min,
        max: cpuSystem.max,
        mean: cpuSystem.mean,
        median: cpuSystem.median,
      },
      memoryDelta,
      memoryPeakDelta,
    };
  });
}

function printAggregateSummary(aggregate: FixtureAggregate[]): void {
  if (!aggregate.length) {
    return;
  }

  console.log('');
  console.log('Aggregate across runs (run-level means):');
  aggregate.forEach((item) => {
    console.log(`Fixture: ${item.id} (${item.runs} runs)`);
    console.log(
      `  wall ms avg/median/min/max: ${item.wallMs.mean.toFixed(2)} / ${item.wallMs.median.toFixed(2)} / ${item.wallMs.min.toFixed(2)} / ${item.wallMs.max.toFixed(2)}`,
    );
    console.log(
      `  cpu user ms avg/median/min/max: ${item.cpuUserMs.mean.toFixed(2)} / ${item.cpuUserMs.median.toFixed(2)} / ${item.cpuUserMs.min.toFixed(2)} / ${item.cpuUserMs.max.toFixed(2)}`,
    );
    console.log(
      `  cpu sys ms avg/median/min/max: ${item.cpuSystemMs.mean.toFixed(2)} / ${item.cpuSystemMs.median.toFixed(2)} / ${item.cpuSystemMs.min.toFixed(2)} / ${item.cpuSystemMs.max.toFixed(2)}`,
    );
    if (item.memoryDelta) {
      const memoryDelta = item.memoryDelta;
      console.log('  memory delta avg/median/min/max (run-level means):');
      MEMORY_STAT_KEYS.forEach((key) => {
        const stats = memoryDelta[key];
        console.log(
          `    ${key}: ${formatBytes(stats.mean)} / ${formatBytes(stats.median)} / ${formatBytes(stats.min)} / ${formatBytes(stats.max)}`,
        );
      });
    }
    if (item.memoryPeakDelta) {
      const memoryPeakDelta = item.memoryPeakDelta;
      console.log('  memory peak delta avg/median/min/max (run-level means):');
      MEMORY_STAT_KEYS.forEach((key) => {
        const stats = memoryPeakDelta[key];
        console.log(
          `    ${key}: ${formatBytes(stats.mean)} / ${formatBytes(stats.median)} / ${formatBytes(stats.min)} / ${formatBytes(stats.max)}`,
        );
      });
    }
  });
}

function run(): void {
  const cliOptions = parseArgs(process.argv.slice(2));
  if (cliOptions.help) {
    printHelp();
    process.exit(0);
  }

  const effectiveConfigPath =
    cliOptions.configPath || (fs.existsSync(DEFAULT_CONFIG_PATH) ? DEFAULT_CONFIG_PATH : null);

  const fileConfig = loadConfig(effectiveConfigPath);
  const config = applyOverrides(fileConfig, cliOptions.overrides);
  validateConfig(config);

  const suites = config.fixture ? {} : loadSuites(config.suitesPath);
  const workItems = resolveWorkItems(config, suites);

  ensureParentDir(path.join(config.outputDir, 'placeholder.txt'));

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runOutput: RunOutput = {
    runId,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    config,
    runs: [],
    aggregateByFixture: [],
  };

  const perRunResults: FixtureRunResult[][] = [];

  for (let runIndex = 1; runIndex <= config.runs; runIndex += 1) {
    console.log(``);
    console.log(`=== Run ${runIndex}/${config.runs} ===`);

    const runResults: FixtureRunResult[] = [];
    workItems.forEach((fixture) => {
      const shouldUpdateSnapshots = config.updateSnapshots && runIndex === 1;
      const result = runFixture(fixture, config, shouldUpdateSnapshots);
      runResults.push(result);
      printFixtureSummary(result);
    });

    perRunResults.push(runResults);
    runOutput.runs.push({
      runIndex,
      results: runResults,
    });
  }

  runOutput.aggregateByFixture = aggregateAcrossRuns(perRunResults);
  printAggregateSummary(runOutput.aggregateByFixture);

  const outputPath = path.join(config.outputDir, `perf-${runId}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(runOutput, null, 2)}\n`, 'utf8');
  console.log(`Wrote perf results: ${outputPath}`);
}

try {
  run();
} catch (error: unknown) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}
