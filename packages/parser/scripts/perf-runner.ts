/* eslint-disable no-console */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { WoWCombatLogParser } from '../dist';

type ParserEventPayload = unknown;

interface ParserErrorPayload {
  message?: string;
  name?: string;
}

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_SUITE = 'default';
const DEFAULT_OUTPUT_DIR = path.resolve(ROOT_DIR, 'perf/results');
const DEFAULT_SUITES_PATH = path.resolve(ROOT_DIR, 'perf/suites.json');

interface CliOptions {
  suite: string;
  fixture: string | null;
  snapshot: string | null;
  timezone: string | null;
  outputDir: string;
  updateSnapshots: boolean;
  skipCompare: boolean;
  iterations: number;
  warmup: number;
  measureMemory: boolean;
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
  memory: { start: NodeJS.MemoryUsage; end: NodeJS.MemoryUsage } | null;
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

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    suite: DEFAULT_SUITE,
    fixture: null,
    snapshot: null,
    timezone: null,
    outputDir: DEFAULT_OUTPUT_DIR,
    updateSnapshots: false,
    skipCompare: false,
    iterations: 1,
    warmup: 0,
    measureMemory: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--suite' && next) {
      options.suite = next;
      i += 1;
    } else if (arg === '--fixture' && next) {
      options.fixture = next;
      i += 1;
    } else if (arg === '--snapshot' && next) {
      options.snapshot = next;
      i += 1;
    } else if (arg === '--timezone' && next) {
      options.timezone = next;
      i += 1;
    } else if (arg === '--output-dir' && next) {
      options.outputDir = path.resolve(process.cwd(), next);
      i += 1;
    } else if (arg === '--iterations' && next) {
      options.iterations = Number(next);
      i += 1;
    } else if (arg === '--warmup' && next) {
      options.warmup = Number(next);
      i += 1;
    } else if (arg === '--update-snapshots') {
      options.updateSnapshots = true;
    } else if (arg === '--skip-compare') {
      options.skipCompare = true;
    } else if (arg === '--measure-memory') {
      options.measureMemory = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.iterations) || options.iterations < 1) {
    throw new Error('--iterations must be a positive number');
  }
  if (!Number.isFinite(options.warmup) || options.warmup < 0) {
    throw new Error('--warmup must be a non-negative number');
  }

  return options;
}

function loadSuites(): SuitesManifest {
  if (!fs.existsSync(DEFAULT_SUITES_PATH)) {
    throw new Error(`Missing suite manifest: ${DEFAULT_SUITES_PATH}`);
  }
  return JSON.parse(fs.readFileSync(DEFAULT_SUITES_PATH, 'utf8')) as SuitesManifest;
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
      update(`big:${currentValue.toString()};`);
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

function parseLog(inputPath: string, timezone: string | null): ParsedResult {
  const parser = new WoWCombatLogParser(null, timezone);
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
  lines.forEach((line) => parser.parseLine(line));
  parser.flush();

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

function printMemoryDelta(before: NodeJS.MemoryUsage, after: NodeJS.MemoryUsage): void {
  const keys: Array<keyof NodeJS.MemoryUsage> = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'];
  keys.forEach((key) => {
    const delta = after[key] - before[key];
    const deltaPrefix = delta >= 0 ? '+' : '-';
    console.log(
      `  ${key}: start=${formatBytes(before[key])} end=${formatBytes(after[key])} delta=${deltaPrefix}${formatBytes(
        Math.abs(delta),
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
  console.log('Options:');
  console.log('  --suite <name>        Suite from perf/suites.json (default: default)');
  console.log('  --fixture <path>      Run a single fixture instead of a suite');
  console.log('  --snapshot <path>     Snapshot path when using --fixture');
  console.log('  --timezone <tz>       Timezone override');
  console.log('  --output-dir <path>   Directory for perf results JSON');
  console.log('  --iterations <n>      Number of measured iterations (default: 1)');
  console.log('  --warmup <n>          Warmup iterations (default: 0)');
  console.log('  --update-snapshots    Replace snapshots with current output');
  console.log('  --skip-compare        Skip snapshot compare (still records hash)');
  console.log('  --measure-memory      Print process memory before/after each run');
  console.log('  -h, --help            Show this help');
  console.log('');
  console.log(
    'CPU profiling: run with `node --cpu-prof --cpu-prof-dir <dir> -r ts-node/register scripts/perf-runner.ts ...`',
  );
}

function resolveWorkItems(options: CliOptions, suites: SuitesManifest): WorkItem[] {
  if (options.fixture) {
    const inputPath = options.fixture;
    return [
      {
        id: path.basename(inputPath, path.extname(inputPath)),
        input: inputPath,
        snapshot: options.snapshot,
        timezone: options.timezone,
      },
    ];
  }

  const suite = suites[options.suite];
  if (!suite) {
    throw new Error(`Unknown suite: ${options.suite}`);
  }

  return suite.fixtures.map((fixture) => ({
    id: fixture.id,
    input: fixture.input,
    snapshot: fixture.snapshot,
    timezone: options.timezone || suite.timezone || null,
  }));
}

function runFixture(fixture: WorkItem, options: CliOptions): FixtureRunResult {
  const inputPath = resolvePath(fixture.input);
  const snapshotPath = resolvePath(fixture.snapshot);
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`Missing input file: ${inputPath}`);
  }

  const iterations: IterationResult[] = [];
  let snapshotRecord: SnapshotRecord | null = null;

  for (let i = 0; i < options.warmup; i += 1) {
    maybeGc();
    parseLog(inputPath, fixture.timezone);
  }

  for (let i = 0; i < options.iterations; i += 1) {
    maybeGc();
    const memStart = options.measureMemory ? process.memoryUsage() : null;
    const wallStart = process.hrtime.bigint();
    const cpuStart = process.cpuUsage();

    const parsed = parseLog(inputPath, fixture.timezone);

    const wallEnd = process.hrtime.bigint();
    const cpuDiff = process.cpuUsage(cpuStart);
    const memEnd = options.measureMemory ? process.memoryUsage() : null;

    if (!snapshotRecord) {
      snapshotRecord = buildSnapshotRecord(parsed, fixture.input, fixture.timezone);
    }

    iterations.push({
      wallMs: Number(wallEnd - wallStart) / 1e6,
      cpuUserMs: cpuDiff.user / 1000,
      cpuSystemMs: cpuDiff.system / 1000,
      memory: memStart && memEnd ? { start: memStart, end: memEnd } : null,
    });
  }

  if (!snapshotRecord) {
    throw new Error(`No snapshot generated for ${fixture.id}`);
  }

  if (options.updateSnapshots) {
    if (!snapshotPath) {
      throw new Error('Missing snapshot path for --update-snapshots');
    }
    ensureParentDir(snapshotPath);
    fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshotRecord, null, 2)}\n`, 'utf8');
    console.log(`Updated snapshot: ${snapshotPath}`);
  } else if (snapshotPath && !options.skipCompare) {
    if (!fs.existsSync(snapshotPath)) {
      throw new Error(`Snapshot not found: ${snapshotPath}`);
    }
    const expectedHash = readSnapshotHash(snapshotPath);
    if (expectedHash !== snapshotRecord.hash) {
      throw new Error(`Snapshot mismatch for ${fixture.id}. Expected ${expectedHash}, got ${snapshotRecord.hash}.`);
    }
  } else if (!snapshotPath) {
    console.log(`No snapshot specified for ${fixture.id}; skipping compare.`);
  } else if (options.skipCompare) {
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

function printSummary(result: FixtureRunResult): void {
  const wall = statsFrom(result.iterations.map((item) => item.wallMs));
  const cpuUser = statsFrom(result.iterations.map((item) => item.cpuUserMs));
  const cpuSystem = statsFrom(result.iterations.map((item) => item.cpuSystemMs));

  console.log(`Fixture: ${result.id}`);
  console.log(
    `  wall ms (min/median/p95/max): ${wall.min.toFixed(2)} / ${wall.median.toFixed(2)} / ${wall.p95.toFixed(2)} / ${wall.max.toFixed(2)}`,
  );
  console.log(
    `  cpu user ms (min/median/p95/max): ${cpuUser.min.toFixed(2)} / ${cpuUser.median.toFixed(2)} / ${cpuUser.p95.toFixed(2)} / ${cpuUser.max.toFixed(2)}`,
  );
  console.log(
    `  cpu sys ms (min/median/p95/max): ${cpuSystem.min.toFixed(2)} / ${cpuSystem.median.toFixed(2)} / ${cpuSystem.p95.toFixed(2)} / ${cpuSystem.max.toFixed(2)}`,
  );

  if (result.iterations[0].memory) {
    console.log('  memory usage per iteration (start -> end):');
    result.iterations.forEach((entry, index) => {
      if (!entry.memory) {
        return;
      }
      console.log(`  iteration ${index + 1}:`);
      printMemoryDelta(entry.memory.start, entry.memory.end);
    });
  }
}

function run(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const suites = options.fixture ? {} : loadSuites();
  const workItems = resolveWorkItems(options, suites);

  ensureParentDir(path.join(options.outputDir, 'placeholder.txt'));

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runOutput: {
    runId: string;
    node: string;
    platform: NodeJS.Platform;
    arch: string;
    iterations: number;
    warmup: number;
    results: FixtureRunResult[];
  } = {
    runId,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    iterations: options.iterations,
    warmup: options.warmup,
    results: [],
  };

  workItems.forEach((fixture) => {
    const result = runFixture(fixture, options);
    runOutput.results.push(result);
    printSummary(result);
  });

  const outputPath = path.join(options.outputDir, `perf-${runId}.json`);
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
