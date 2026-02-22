/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { createRequire } from 'module';

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

for (let i = 0; i < warmupIterations; i += 1) {
  for (const payload of payloads) {
    parseWowToJSON(payload);
  }
}

const start = process.hrtime.bigint();
for (let i = 0; i < iterations; i += 1) {
  for (const payload of payloads) {
    parseWowToJSON(payload);
  }
}
const end = process.hrtime.bigint();

const elapsedNs = Number(end - start);
const elapsedMs = elapsedNs / 1e6;
const perParseUs = (elapsedNs / totalParses) / 1e3;

console.log(`Elapsed: ${elapsedMs.toFixed(2)} ms`);
console.log(`Per-parse: ${perParseUs.toFixed(2)} µs`);
