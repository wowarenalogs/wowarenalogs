/* eslint-disable no-console */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { WoWCombatLogParser } = require('../dist');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_SUITE = 'default';
const DEFAULT_OUTPUT_DIR = path.resolve(ROOT_DIR, 'perf/results');
const DEFAULT_SUITES_PATH = path.resolve(ROOT_DIR, 'perf/suites.json');

function parseArgs(argv) {
  const options = {
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

function loadSuites() {
  if (!fs.existsSync(DEFAULT_SUITES_PATH)) {
    throw new Error(`Missing suite manifest: ${DEFAULT_SUITES_PATH}`);
  }
  return JSON.parse(fs.readFileSync(DEFAULT_SUITES_PATH, 'utf8'));
}

function resolvePath(relOrAbs) {
  if (!relOrAbs) return null;
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.resolve(ROOT_DIR, relOrAbs);
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function maybeGc() {
  if (typeof global.gc === 'function') {
    global.gc();
  }
}

function computeStableHash(value) {
  const hash = crypto.createHash('sha256');
  const seen = new WeakSet();

  function update(str) {
    hash.update(str);
  }

  function walk(currentValue) {
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

    if (seen.has(currentValue)) {
      update('[Circular];');
      return;
    }
    seen.add(currentValue);

    if (Array.isArray(currentValue)) {
      update('[;');
      currentValue.forEach((item) => {
        walk(item);
        update(',;');
      });
      update('];');
      seen.delete(currentValue);
      return;
    }

    if (currentValue instanceof Date) {
      update(`date:${currentValue.toISOString()};`);
      seen.delete(currentValue);
      return;
    }

    if (Buffer.isBuffer(currentValue)) {
      update(`buf:${currentValue.toString('hex')};`);
      seen.delete(currentValue);
      return;
    }

    update('{;');
    Object.keys(currentValue)
      .sort()
      .forEach((key) => {
        const child = currentValue[key];
        if (typeof child === 'undefined' || typeof child === 'function' || typeof child === 'symbol') {
          return;
        }
        update(`key:${JSON.stringify(key)};`);
        walk(child);
        update(',;');
      });
    update('};');
    seen.delete(currentValue);
  }

  walk(value);
  return hash.digest('hex');
}

function readSnapshotHash(snapshotPath) {
  const content = fs.readFileSync(snapshotPath, 'utf8').trim();
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.hash === 'string') {
      return parsed.hash;
    }
  } catch (_error) {
    // Fall back to plain text hash for backward compatibility.
  }

  return content;
}

function readLogLines(inputPath) {
  const content = fs.readFileSync(inputPath, 'utf8');
  return content.split('\n');
}

function parseLog(inputPath, timezone) {
  const parser = new WoWCombatLogParser(null, timezone);
  const parsed = {
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
    parsed.parserErrors.push({
      message: error.message,
      name: error.name,
    });
  });

  const lines = readLogLines(inputPath);
  lines.forEach((line) => parser.parseLine(line));
  parser.flush();

  return parsed;
}

function buildSnapshotRecord(parsed, inputPath, timezone) {
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

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function printMemoryDelta(before, after) {
  const keys = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'];
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

function statsFrom(values) {
  if (!values.length) return null;
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

function printHelp() {
  console.log('Parse combat logs, compare snapshots, and collect perf metrics.');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/perf-runner.js [options]');
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
  console.log('CPU profiling: run with `node --cpu-prof --cpu-prof-dir <dir> scripts/perf-runner.js ...`');
}

function resolveWorkItems(options, suites) {
  if (options.fixture) {
    const inputPath = options.fixture;
    const snapshotPath = options.snapshot;
    return [
      {
        id: path.basename(inputPath, path.extname(inputPath)),
        input: inputPath,
        snapshot: snapshotPath,
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
    timezone: options.timezone || suite.timezone,
  }));
}

function runFixture(fixture, options) {
  const inputPath = resolvePath(fixture.input);
  const snapshotPath = resolvePath(fixture.snapshot);
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`Missing input file: ${inputPath}`);
  }

  const iterations = [];
  let snapshotRecord = null;

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

  if (options.updateSnapshots) {
    if (!snapshotPath) {
      throw new Error('Missing snapshot path for --update-snapshots');
    }
    ensureParentDir(snapshotPath);
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshotRecord, null, 2) + '\n', 'utf8');
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

function printSummary(result) {
  const wall = statsFrom(result.iterations.map((item) => item.wallMs));
  const cpuUser = statsFrom(result.iterations.map((item) => item.cpuUserMs));
  const cpuSystem = statsFrom(result.iterations.map((item) => item.cpuSystemMs));

  console.log(`Fixture: ${result.id}`);
  console.log(`  wall ms (min/median/p95/max): ${wall.min.toFixed(2)} / ${wall.median.toFixed(2)} / ${wall.p95.toFixed(2)} / ${wall.max.toFixed(2)}`);
  console.log(`  cpu user ms (min/median/p95/max): ${cpuUser.min.toFixed(2)} / ${cpuUser.median.toFixed(2)} / ${cpuUser.p95.toFixed(2)} / ${cpuUser.max.toFixed(2)}`);
  console.log(`  cpu sys ms (min/median/p95/max): ${cpuSystem.min.toFixed(2)} / ${cpuSystem.median.toFixed(2)} / ${cpuSystem.p95.toFixed(2)} / ${cpuSystem.max.toFixed(2)}`);

  if (result.iterations[0].memory) {
    console.log('  memory usage per iteration (start -> end):');
    result.iterations.forEach((entry, index) => {
      console.log(`  iteration ${index + 1}:`);
      printMemoryDelta(entry.memory.start, entry.memory.end);
    });
  }
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const suites = options.fixture ? null : loadSuites();
  const workItems = resolveWorkItems(options, suites || {});

  ensureParentDir(path.join(options.outputDir, 'placeholder.txt'));

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runOutput = {
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
  fs.writeFileSync(outputPath, JSON.stringify(runOutput, null, 2) + '\n', 'utf8');
  console.log(`Wrote perf results: ${outputPath}`);
}

try {
  run();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
