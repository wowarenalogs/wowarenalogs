/* eslint-disable no-console */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { WoWCombatLogParser } = require('../dist');

const DEFAULT_INPUT = path.resolve(__dirname, './ca245a5f148e6a7ae7dc952706c5d03a.txt');
const DEFAULT_OUTPUT = path.resolve(__dirname, '../test/snapshots/parsed-output.json');
const DEFAULT_SNAPSHOT = path.resolve(__dirname, '../test/snapshots/parsed-output.snapshot.json');
const DEFAULT_TIMEZONE = 'America/New_York';

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    snapshot: DEFAULT_SNAPSHOT,
    timezone: DEFAULT_TIMEZONE,
    updateSnapshot: false,
    measureMemory: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--input' && next) {
      options.input = path.resolve(process.cwd(), next);
      i += 1;
    } else if (arg === '--output' && next) {
      options.output = path.resolve(process.cwd(), next);
      i += 1;
    } else if (arg === '--snapshot' && next) {
      options.snapshot = path.resolve(process.cwd(), next);
      i += 1;
    } else if (arg === '--timezone' && next) {
      options.timezone = next;
      i += 1;
    } else if (arg === '--update-snapshot') {
      options.updateSnapshot = true;
    } else if (arg === '--measure-memory') {
      options.measureMemory = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
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

function buildRunResult(data, inputPath, timezone) {
  return {
    algorithm: 'sha256',
    hash: computeStableHash(data),
    input: inputPath,
    timezone,
    counts: {
      combats: data.combats.length,
      malformedCombats: data.malformedCombats.length,
      shuffleRounds: data.shuffleRounds.length,
      shuffles: data.shuffles.length,
      activityStarts: data.activityStarts.length,
      battlegrounds: data.battlegrounds.length,
      parserErrors: data.parserErrors.length,
    },
  };
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
      stack: error.stack,
    });
  });

  const lines = readLogLines(inputPath);
  lines.forEach((line) => parser.parseLine(line));
  parser.flush();

  return parsed;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function maybeGc() {
  if (typeof global.gc === 'function') {
    global.gc();
  }
}

function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  };
}

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function printMemoryStats(before, after) {
  const keys = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'];
  console.log('Memory usage:');
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

function printHelp() {
  console.log('Parse a combat log and compare output to a snapshot.');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/parse-snapshot-test.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --input <path>       Combat log file to parse');
  console.log('  --output <path>      Where to write run metadata and parsed hash');
  console.log('  --snapshot <path>    Snapshot hash file to compare against');
  console.log('  --timezone <tz>      Timezone used for parser initialization');
  console.log('  --update-snapshot    Replace snapshot with latest dump');
  console.log('  --measure-memory     Print process memory before/after run');
  console.log('  -h, --help           Show this help');
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  maybeGc();
  const memoryStart = options.measureMemory ? getMemoryUsage() : null;

  const parsed = parseLog(options.input, options.timezone);
  const runResult = buildRunResult(parsed, options.input, options.timezone);
  const runResultString = JSON.stringify(runResult, null, 2) + '\n';

  ensureParentDir(options.output);
  fs.writeFileSync(options.output, runResultString, 'utf8');
  console.log(`Wrote parse hash result: ${options.output}`);

  if (options.updateSnapshot) {
    ensureParentDir(options.snapshot);
    fs.writeFileSync(options.snapshot, runResultString, 'utf8');
    console.log(`Updated snapshot: ${options.snapshot}`);
    if (options.measureMemory && memoryStart) {
      maybeGc();
      printMemoryStats(memoryStart, getMemoryUsage());
    }
    process.exit(0);
  }

  if (!fs.existsSync(options.snapshot)) {
    console.error(`Snapshot not found: ${options.snapshot}`);
    console.error('Run with --update-snapshot to create one.');
    process.exit(1);
  }

  const expectedHash = readSnapshotHash(options.snapshot);
  if (expectedHash !== runResult.hash) {
    console.error('Snapshot mismatch detected.');
    console.error(`Expected snapshot: ${options.snapshot}`);
    console.error(`Actual dump:      ${options.output}`);
    console.error(`Expected hash:    ${expectedHash}`);
    console.error(`Actual hash:      ${runResult.hash}`);
    if (options.measureMemory && memoryStart) {
      maybeGc();
      printMemoryStats(memoryStart, getMemoryUsage());
    }
    process.exit(1);
  }

  console.log('Snapshot matched.');
  if (options.measureMemory && memoryStart) {
    maybeGc();
    printMemoryStats(memoryStart, getMemoryUsage());
  }
  process.exit(0);
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
