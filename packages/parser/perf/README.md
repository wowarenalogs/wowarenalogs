# Parser Perf + Snapshot Suite

This folder contains fixtures, snapshots, and perf results for parser regression checks.

## Quick Start

```bash
# Build parser first if needed
npm run build:parser

# Verify snapshots + collect metrics
npm run perf:run -w @wowarenalogs/parser

# Update snapshots
npm run perf:update -w @wowarenalogs/parser

# Benchmark (default: 5 full runs)
npm run perf:bench -w @wowarenalogs/parser
```

Perf runs are configured with JSON files in `perf/configs/`.

## Run Configs

`perf/configs/default.json` is used by default and supports:

- `suite`: suite name from `perf/suites.json`
- `suitesPath`: suite manifest path
- `runs`: number of full suite runs
- `iterations`: measured iterations per fixture in each run
- `warmup`: warmup iterations per fixture in each run
- `measureMemory`: include per-iteration memory deltas
- `updateSnapshots`: rewrite snapshot files (first run only)
- `skipCompare`: skip hash compare
- `outputDir`: output directory for perf JSON

Example override:

```bash
npm run perf:run -w @wowarenalogs/parser -- --config perf/configs/benchmark.json
```

You can still override individual fields at runtime (for ad hoc runs):

```bash
npm run perf:run -w @wowarenalogs/parser -- --runs 10 --iterations 2
```

## Aggregates

When `runs > 1`, the runner computes aggregate metrics across the run set for each fixture:

- average
- median
- min
- max

(Computed on each run's mean metric values.)

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
