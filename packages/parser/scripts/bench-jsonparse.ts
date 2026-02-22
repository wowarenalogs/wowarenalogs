/* eslint-disable no-console */
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseWowToJSON } = require('../src/jsonparse');

const LINE_PARSER = /^(.*)? {2}([A-Z_]+),(.+)\s*$/;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_FIXTURE = path.resolve(ROOT_DIR, 'perf/fixtures/ca245a5f148e6a7ae7dc952706c5d03a.txt');

const fixturePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_FIXTURE;
const warmupIterations = Number(process.argv[3] ?? 1);
const iterations = Number(process.argv[4] ?? 5);

const raw = fs.readFileSync(fixturePath, 'utf8');
const lines = raw.split(/\r?\n/).filter(Boolean);

const payloads: string[] = [];
for (const line of lines) {
  const match = line.match(LINE_PARSER);
  if (match && match[3]) {
    payloads.push(match[3]);
  }
}

if (payloads.length === 0) {
  throw new Error(`No parseable lines found in ${fixturePath}`);
}

const totalParses = payloads.length * iterations;
const warmupParses = payloads.length * warmupIterations;

console.log(`Fixture: ${fixturePath}`);
console.log(`Payloads: ${payloads.length}`);
console.log(`Warmup: ${warmupIterations} iteration(s) (${warmupParses} parses)`);
console.log(`Runs: ${iterations} iteration(s) (${totalParses} parses)`);

function escapeCommasLegacy(line: string): string {
  const COMMA_SENTINEL_CHARACTER = '@';
  const marks: number[] = [];
  let inside_quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    const prev_c = i > 0 ? line[i - 1] : null;
    if (inside_quoted) {
      if (c === '"' && (prev_c == null || prev_c !== '\\')) {
        inside_quoted = false;
        continue;
      }
      if (c === ',') {
        marks.push(i);
      }
    } else if (c === '"') {
      inside_quoted = true;
    }
  }
  if (marks.length === 0) {
    return line;
  }
  const chars = line.split('');
  for (const m of marks) {
    chars[m] = COMMA_SENTINEL_CHARACTER;
  }
  return chars.join('');
}

function unEscapeCommasLegacy(line: string): string {
  return line.replace('@', ',');
}

// Legacy implementation from before the optimizations (kept local to the benchmark).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseWowToJSONLegacy(logline: string): any {
  const parametersForJson = escapeCommasLegacy(logline).split(',');
  let buf = '';
  for (const p of parametersForJson) {
    if (buf) {
      buf += ',';
    }
    if (/^[-0-9)(.\][]+$/g.test(p)) {
      if (/^0+$/g.test(p)) {
        buf += '0';
      } else {
        buf += p;
      }
    } else if (p[0] === '"') {
      buf += p;
    } else {
      // eslint-disable-next-line no-useless-escape
      const openingMarkers = /^([\(\)\]\[]+)/g;
      // eslint-disable-next-line no-useless-escape
      const closingMarkers = /([\(\)\]\[]+)$/g;
      let prefix = openingMarkers.exec(p) || '';
      let suffix = closingMarkers.exec(p) || '';
      prefix = prefix ? prefix[0] : '';
      suffix = suffix ? suffix[0] : '';

      let tempP = p.replace(openingMarkers, '');
      tempP = tempP.replace(closingMarkers, '');
      buf += `${prefix}"${tempP}"${suffix}`;
    }
  }
  buf = buf.replace(/\(/g, '[');
  buf = buf.replace(/\)/g, ']');
  return JSON.parse(`{"data":[${unEscapeCommasLegacy(buf).replaceAll('[,[', '[[')}]}`);
}

function runBench(label: string, parser: (payload: string) => void) {
  for (let i = 0; i < warmupIterations; i += 1) {
    for (const payload of payloads) {
      parser(payload);
    }
  }

  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) {
    for (const payload of payloads) {
      parser(payload);
    }
  }
  const end = process.hrtime.bigint();

  const elapsedNs = Number(end - start);
  const elapsedMs = elapsedNs / 1e6;
  const perParseUs = elapsedNs / totalParses / 1e3;

  console.log('');
  console.log(label);
  console.log(`Elapsed: ${elapsedMs.toFixed(2)} ms`);
  console.log(`Per-parse: ${perParseUs.toFixed(2)} µs`);
}

runBench('Current parseWowToJSON', parseWowToJSON);
runBench('Legacy parseWowToJSON', parseWowToJSONLegacy);
