# WoW Arena Logs — Feature & Bug Tracker

Active work items. Completed/N/A items archived in `TRACKER_ARCHIVE.md`.

---

## Bugs

| #   | Status  | Description                                                                                                                                                                                                                                  | File(s)                |
| --- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| B10 | ❌ Open | Trinket item ID lists stale — `ADAPTATION_ITEM_IDS` and `RELENTLESS_ITEM_IDS` are hardcoded and not updated each season. New season gear silently unrecognized → trinket type classified Unknown → trinket analysis disabled for that player | `ccTrinketAnalysis.ts` |

---

## Features

### Recently completed (S2–S3)

| #   | Description                                                                                                                                                                                                                                                                                                                                               | File(s)                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| F13 | Timing classification — Early/Optimal/Late/Reactive label on defensive CD usage                                                                                                                                                                                                                                                                           | `cooldowns.ts`                                                        |
| F14 | Offensive Vulnerability Windows — when was enemy vulnerable and did team capitalise. Event-driven state machine; `capitalized` flag when friendly damage ratio ≥ 1.2                                                                                                                                                                                      | `offensiveWindows.ts`                                                 |
| F15 | DR Chain Tracking — CC DR state per target per category. Each `ICCInstance` carries `drInfo` (category, level, sequenceIndex). Outgoing chains with notable DR (≥50%) surfaced to Claude                                                                                                                                                                  | `drAnalysis.ts`, `ccTrinketAnalysis.ts`, `CombatAIAnalysis/index.tsx` |
| F25 | Target selection evaluation — for each offensive window, snapshots ALL enemies (HP%, defensives available/spent, trinket state) and flags when a better target existed (≥15 softness score margin). Softness = 50×(1−HP%) + 50×(defensives spent / total tracked)                                                                                         | `killWindowTargetSelection.ts` (new), `CombatAIAnalysis/index.tsx`    |
| F27 | CC avoidability — each `ICCInstance` carries `distanceYards` and `losBlocked`. Melee-range CCs (≤8yd) flagged as possible positioning mistakes. Geometry for all 16 arenas implemented                                                                                                                                                                    | `ccTrinketAnalysis.ts`, `losAnalysis.ts`, `arenaGeometry.ts`          |
| F37 | Death-anchored output — non-death critical moments carry `contributingDeathSpec/AtSeconds` if a friendly death occurred within 45s. Death moments carry `rootCauseTrace`: backward causal chain (which CDs were on CD + timing label of last use, CC active at death + avoidability). Context emits `⚠ Contributing factor` and `Root cause trace` blocks | `CombatAIAnalysis/index.tsx`                                          |

### Open / Todo

| #   | Sprint | Description                                                                                                                                                                           | File(s)                                      |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| F12 | S2     | Kill Window Quality — detect if kill window was wasted (split dmg, free healer, missing CC)                                                                                           | —                                            |
| F16 | S3     | CDR Heuristics (Shifting Power, Wake of Ashes only)                                                                                                                                   | —                                            |
| F17 | S3     | CC During Enemy Burst — was right CC used at right time into burst window                                                                                                             | —                                            |
| F18 | S4     | Fatal Dispel Flagging (UA backlash)                                                                                                                                                   | —                                            |
| F19 | S4     | Mana Curve                                                                                                                                                                            | —                                            |
| F20 | S4     | Interrupt Analysis                                                                                                                                                                    | —                                            |
| F22 | S2     | Trade necessity + cost modeling — classify each major CD use: was the trade necessary (real enemy burst) or panic? What is the estimated cost of using the CD here vs. holding 5–10s? | `cooldowns.ts`, `CombatAIAnalysis/index.tsx` |
| F23 | S2     | Blame assignment — classify each finding as: self mistake / teammate mistake / unavoidable situation                                                                                  | `CombatAIAnalysis/index.tsx`, `analyze.ts`   |
| F24 | S2     | Avoidability framing — for panic/overlap defensives and CC chains: was this avoidable?                                                                                                | `cooldowns.ts`, `ccTrinketAnalysis.ts`       |
| F26 | S3     | ⚠️ Mirror benchmarking — feasibility unclear. Both players present in same log when specs match, but AI_FEATURES.md marks out of scope. Needs decision before implementing            | `CombatAIAnalysis/index.tsx`                 |
| F34 | S2     | Prompt optimization — (1) inject spec-specific R1 baselines from `benchmark_data.json`; (2) audit prompt framing bias (context order, blame anchoring)                                | `analyze.ts`, `CombatAIAnalysis/index.tsx`   |
| F35 | S2     | Match archetype classification — comp archetype (double melee, RMP, etc.) + game pace (burst vs dampening). Weight evaluation signals differently by archetype                        | `CombatAIAnalysis/index.tsx`, `analyze.ts`   |
| F36 | S2     | Invalid GCD detection — during enemy burst window, flag when player cast damage/filler spells instead of defensive/healing actions                                                    | `cooldowns.ts`, `CombatAIAnalysis/index.tsx` |

---

## Notes

- Sprint 2 focus: Decision quality layer — timing, trade necessity, blame assignment
- Sprint 3 focus: Target selection, avoidability, CC during burst
- Core shift: from "behavior analysis" to "decision analysis" — answer "was the trade correct" not "did you press the button"
- R1 player framing: "what did we trade, could we have avoided it, for what cost"
- See `AI_FEATURES.md` for design philosophy; `AI_UTILS.md` for per-utility detail; `TRACKER_ARCHIVE.md` for completed items
