# Parser Perf + Snapshot Suite

This folder contains fixtures, snapshots, and perf results for parser regression checks.

## Quick Start

```bash
# Build parser first if needed
npm run build:parser

# Verify snapshots + collect metrics (1 iteration)
npm run perf:run -w @wowarenalogs/parser

# Update snapshots
npm run perf:update -w @wowarenalogs/parser

# Benchmark (5 iterations + 1 warmup)
npm run perf:bench -w @wowarenalogs/parser
```

## Memory Metrics

```bash
npm run perf:memory -w @wowarenalogs/parser
```

## CPU Profiles (Flamegraphs)

This uses Node's built-in CPU profiler. Output is a `.cpuprofile` file in `perf/results`.

```bash
npm run perf:cpu-prof -w @wowarenalogs/parser
```

Open the `.cpuprofile` in Chrome DevTools or speedscope for flamegraphs.

## Adding Fixtures

1. Drop the log file into `perf/fixtures/`.
2. Add an entry to `perf/suites.json` with an `id`, `input`, and `snapshot` path.
3. Run `npm run perf:update -w @wowarenalogs/parser` to create the snapshot.
