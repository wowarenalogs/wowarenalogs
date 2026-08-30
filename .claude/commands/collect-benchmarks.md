Collect reference benchmark data from high-rated arena matches and persist it to `packages/tools/benchmarks/benchmark_data.json`.

## What this does

Downloads recent matches from the public wowarenalogs.com GraphQL API, fetches each raw combat log from GCS, parses it, and extracts per-spec reference statistics used to calibrate analysis thresholds:

- **Pressure windows** — damage taken per 10s distribution → calibrates panic detection thresholds
- **HPS / DPS** — healer and DPS output baselines
- **Defensive timing** — % Optimal/Early/Late/Reactive/Unknown per spec at this rating
- **CD never-used rate** — per spec per CD, how often it's skipped
- **Purge rate** — purges per minute for dispel-capable specs
- **Match duration + dampening at death** — context for AI framing

## Prerequisites

Parser must be built first (one-time, or after parser changes):

```bash
npm run build:parser
```

## Run

```bash
# Default: download 100 new matches, 3v3, 2100+ MMR (corpus grows across runs)
npm run -w @wowarenalogs/tools start:collectBenchmarks

# Download 200 new matches in one go
MATCH_COUNT=200 npm run -w @wowarenalogs/tools start:collectBenchmarks

# Higher rating floor (fewer matches available, better signal)
MIN_RATING=2400 npm run -w @wowarenalogs/tools start:collectBenchmarks
```

## Parameters

| Env var            | Default                  | Notes                                                                                                                                                                           |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MATCH_COUNT`      | 100                      | **New** matches to download per run. Already-cached matches are always re-processed. Corpus grows with each run.                                                                |
| `MIN_RATING`       | 2100                     | Rating bucket. Values: 1400, 1800, 2100, 2400 (maps to Firestore `extra.gteXXXX` flags). At 2400 only ~47 recent matches may be available — use 2100 for broader spec coverage. |
| `BRACKET`          | 3v3                      | Match bracket filter.                                                                                                                                                           |
| `CONCURRENCY`      | 5                        | Parallel GCS log downloads.                                                                                                                                                     |
| `MAX_LOG_AGE_DAYS` | 60                       | Purge cached logs older than this many days. Old logs are deleted from disk and removed from manifest automatically.                                                            |
| `API_BASE`         | https://wowarenalogs.com | GraphQL host.                                                                                                                                                                   |

## Local log cache

Downloaded logs are cached in `packages/tools/benchmarks/logs/{matchId}.log` (gitignored). A manifest at `packages/tools/benchmarks/log_manifest.json` (also gitignored) tracks what's been downloaded.

**Corpus grows across runs** — each run adds new matches without re-downloading existing ones. To rebuild from scratch, delete the `logs/` directory and `log_manifest.json`.

**Automatic purge** — logs older than `MAX_LOG_AGE_DAYS` are deleted on each run. Increase this value to keep a larger corpus.

## How the data flows

1. **GraphQL API** (`/api/graphql` → `latestMatches` query) returns match stubs with `logObjectUrl` pointing to GCS.
2. **GCS** bucket `wowarenalogs-log-files-prod` is publicly readable — no auth needed.
3. **Parser** (`WoWCombatLogParser`) turns raw log text into structured `IArenaMatch` / `IShuffleRound` objects.
4. **Analysis utilities** (`extractMajorCooldowns`, `annotateDefensiveTimings`, `reconstructEnemyCDTimeline`, `getDampeningPercentage`, `canOffensivePurge`) run on each combat — same code path as the live AI analysis.
5. Stats are aggregated per spec and written to `packages/tools/benchmarks/benchmark_data.json`.

## Output location

```
packages/tools/benchmarks/benchmark_data.json
```

The file is checked into the repo as a reference snapshot. Re-run after major patches to recalibrate.

## When to re-run

- After a major WoW patch (ilvl increases, class tuning, HP pool changes)
- After changes to analysis utility thresholds (to validate the new values)
- When adding new specs or expanding the analysis pipeline

## Key thresholds this data calibrates

All in `packages/shared/src/utils/cooldowns.ts`. Each constant has a `⚠️ PATCH-VOLATILE` comment:

- `PANIC_PRESS_DAMAGE_THRESHOLD_HEALER` — was 68k, lowered to 35k after benchmark showed Holy Priest P90 ≈ 45k/7s
- `PANIC_PRESS_DAMAGE_THRESHOLD_DPS` — currently 60k, validated as below P50 for most DPS specs
- `PANIC_PRESS_DAMAGE_THRESHOLD_TANK` — 135k, not yet validated (insufficient tank sample)

## Console output

The script prints three summary tables on completion:

1. **Pressure P90 by spec** — direct input for threshold calibration
2. **Defensive timing distribution** — R1 baseline for Optimal/Early/Late/Unknown rates
3. **Purge rate by spec** — p50/p75/p90 purges per minute

## Known limitations

- **DPS metric is match-wide average** (all friendlies / duration), not per-player. Individual spec DPS needs per-player split.
- **Warlock Demonology** shows 0 purge rate — correct, Demo rarely runs Felhunter in arena.
- **Holy Priest / Pres Evoker** show high `Unknown` defensive timing (~50%) — expected, these specs press short-CD defensives proactively outside of enemy burst windows. `Unknown` ≠ mistake for these specs.
- Spec coverage depends on what comps are in the fetched matches. Run at `MIN_RATING=2100` for broader spec coverage.
