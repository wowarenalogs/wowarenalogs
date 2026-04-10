# AI Analysis Utilities

Each utility in `packages/shared/src/utils/` runs on parsed `IArenaMatch` / `IShuffleRound` objects and produces structured data injected into the Claude prompt via `buildMatchContext()` in `CombatAIAnalysis/index.tsx`.

| File                           | Feature     | What it produces                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cooldowns.ts`                 | F1, F4, F13 | Major CD extraction, panic/overlap detection, Early/Optimal/Late/Reactive timing labels. Contains `PANIC_PRESS_DAMAGE_THRESHOLD_*` constants (⚠️ patch-volatile — calibrated from benchmark data).                                                                                                                                                |
| `enemyCDs.ts`                  | F2          | Enemy offensive CD timeline with buff-expiry tracking via `spellEffectData.durationSeconds`.                                                                                                                                                                                                                                                      |
| `dampening.ts`                 | F3          | Dampening % curve over match duration.                                                                                                                                                                                                                                                                                                            |
| `dispelAnalysis.ts`            | F5, F21     | Cleanse/purge analysis: missed cleanses, missed purges with priority signals (CD state, expected buff duration, team pressure). `canOffensivePurge()` and `canDefensiveCleanse()` are talent-aware.                                                                                                                                               |
| `healingGaps.ts`               | F6          | Gaps where healer output dropped below threshold during enemy burst.                                                                                                                                                                                                                                                                              |
| `ccTrinketAnalysis.ts`         | F7, F15     | CC received per player with trinket state. Each `ICCInstance` carries `drInfo` (DR category + level) computed by `drAnalysis.ts`.                                                                                                                                                                                                                 |
| `offensiveWindows.ts`          | F14         | Enemy defensive vulnerability windows: event-driven state machine (CD_USED → BUFF_EXPIRED → CD_READY). `capitalized` flag when friendly damage ratio ≥ 1.2.                                                                                                                                                                                       |
| `drAnalysis.ts`                | F15         | DR chain tracking. `getDRLevel()` backward-walks the CC history for correct `sequenceIndex`. Handles `SPELL_AURA_REFRESH`. Outgoing CC chains with notable DR (≥50% reduction) surfaced separately. Note: Immune is mathematically reachable but WoW never emits `SPELL_AURA_APPLIED` for immune casts — outgoing path caps at 25% in practice.   |
| `killWindowTargetSelection.ts` | F25         | Per-window target comparison: snapshots all enemies at the start of each offensive window (HP% via `advancedActions`, defensive state via cast history replay, trinket CD via PvP trinket spell IDs). Softness score = 50×(1−HP%) + 50×(defenses spent / total). Flags when an alternative target scored ≥15 points higher (configurable margin). |

## Benchmark Pipeline (`packages/tools/`)

`src/collectBenchmarks.ts` downloads high-rated (≥2100 MMR) public match logs from GCS, parses them, and extracts per-spec reference statistics into `benchmarks/benchmark_data.json` (committed). Raw logs cached in `benchmarks/logs/` (gitignored).

```bash
npm run build:parser   # required once before running
npm run -w @wowarenalogs/tools start:collectBenchmarks
# env vars: MATCH_COUNT=100  MIN_RATING=2100  MAX_LOG_AGE_DAYS=60  CONCURRENCY=5
```

Metrics: pressure P90 per spec, HPS/DPS, defensive timing % (Optimal/Early/Late/Reactive/Unknown), CD never-used rates, purge rates, dampening at death. Used to calibrate `PANIC_PRESS_DAMAGE_THRESHOLD_*` in `cooldowns.ts`.
