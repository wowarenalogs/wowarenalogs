/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');

function readLatestJson(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({
      file,
      mtime: fs.statSync(path.join(dir, file)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    throw new Error(`No JSON files found in ${dir}`);
  }

  const latestPath = path.join(dir, files[0].file);
  return {
    path: latestPath,
    data: JSON.parse(fs.readFileSync(latestPath, 'utf8')),
  };
}

function formatMs(value) {
  return `${value.toFixed(2)} ms`;
}

function formatPct(value) {
  return `${value.toFixed(2)}%`;
}

function compareFixtures(baseline, current) {
  const baselineById = new Map(baseline.aggregateByFixture.map((f) => [f.id, f]));
  const lines = [];

  for (const fixture of current.aggregateByFixture) {
    const base = baselineById.get(fixture.id);
    if (!base) {
      lines.push(`- ${fixture.id}: no baseline found`);
      continue;
    }

    const baseMean = base.wallMs.mean;
    const currMean = fixture.wallMs.mean;
    const meanDeltaPct = ((currMean - baseMean) / baseMean) * 100;

    const baseMedian = base.wallMs.median;
    const currMedian = fixture.wallMs.median;
    const medianDeltaPct = ((currMedian - baseMedian) / baseMedian) * 100;

    lines.push(
      `- ${fixture.id}: mean ${formatMs(currMean)} (${formatPct(meanDeltaPct)}), ` +
        `median ${formatMs(currMedian)} (${formatPct(medianDeltaPct)})`,
    );
  }

  return lines.join('\n');
}

function main() {
  const baselineDir = process.argv[2];
  const currentDir = process.argv[3];
  const osLabel = process.argv[4] ?? 'unknown-os';

  if (!baselineDir || !currentDir) {
    throw new Error('Usage: node compare-perf.js <baselineDir> <currentDir> <osLabel>');
  }

  const baseline = readLatestJson(baselineDir);
  const current = readLatestJson(currentDir);

  const summary = compareFixtures(baseline.data, current.data);

  console.log(`Perf comparison (${osLabel})`);
  console.log(`Baseline: ${baseline.path}`);
  console.log(`Current: ${current.path}`);
  console.log(summary);

  const outputPath = path.join(currentDir, `perf-compare-${osLabel}.md`);
  const body = [
    `## Perf Benchmark (${osLabel})`,
    '',
    `Baseline: \`${baseline.path}\``,
    `Current: \`${current.path}\``,
    '',
    summary,
    '',
  ].join('\n');

  fs.writeFileSync(outputPath, body, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

main();
