/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const { WoWCombatLogParser } = require('../dist');

const DEFAULT_INPUT = path.resolve(__dirname, '../test/testlogs/two_matches.txt');
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

function sortDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value && typeof value === 'object') {
    const sorted = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        sorted[key] = sortDeep(value[key]);
      });
    return sorted;
  }
  return value;
}

function formatForSnapshot(data) {
  return JSON.stringify(sortDeep(data), null, 2);
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
  console.log('  --output <path>      Where to write the parsed dump json');
  console.log('  --snapshot <path>    Snapshot json file to compare against');
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
  const formatted = formatForSnapshot(parsed);

  ensureParentDir(options.output);
  fs.writeFileSync(options.output, formatted + '\n', 'utf8');
  console.log(`Wrote parsed dump: ${options.output}`);

  if (options.updateSnapshot) {
    ensureParentDir(options.snapshot);
    fs.writeFileSync(options.snapshot, formatted + '\n', 'utf8');
    console.log(`Updated snapshot: ${options.snapshot}`);
    process.exit(0);
  }

  if (!fs.existsSync(options.snapshot)) {
    console.error(`Snapshot not found: ${options.snapshot}`);
    console.error('Run with --update-snapshot to create one.');
    process.exit(1);
  }

  const existingSnapshot = fs.readFileSync(options.snapshot, 'utf8');
  if (existingSnapshot !== formatted + '\n') {
    console.error('Snapshot mismatch detected.');
    console.error(`Expected snapshot: ${options.snapshot}`);
    console.error(`Actual dump:      ${options.output}`);
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
