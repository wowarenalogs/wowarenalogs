# TRACKER — Archived (Completed / N/A)

Moved from TRACKER.md to keep the active tracker lean.

---

## Bugs (Fixed)

| #   | Description                                                                                                                                                           | File(s)                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| B1  | History tab empty after manual log import — handlers not registered without WoW dir                                                                                   | `LocalCombatsContext/index.tsx`            |
| B2  | `setCombats([])` in cleanup wiped imported combats on auth state change                                                                                               | `LocalCombatsContext/index.tsx`            |
| B3  | `IShuffleRound` has no `.rounds` — history page called `c.rounds.map()` incorrectly                                                                                   | `history/page.tsx`                         |
| B4  | Match page spun forever for local matches — always fetched from GCS                                                                                                   | `match/page.tsx`                           |
| B5  | AI flagged missed purges at healer who cannot purge (Mistweaver, etc.)                                                                                                | `analyze.ts`, `CombatAIAnalysis/index.tsx` |
| B6  | Some purgeable buffs missing from detection; some non-purgeable buffs included                                                                                        | `dispelAnalysis.ts`                        |
| B7  | Dispel analysis flags unpurgeable spells as missed purge — e.g. Paladin Divine Shield                                                                                 | `dispelAnalysis.ts`                        |
| B8  | Pressure threshold flat 250k fallback when advanced logging disabled — wrong for all specs. Fix: derive per-role threshold from spec type when advancedActions absent | `cooldowns.ts`, `healingGaps.ts`           |
| B9  | Enemy CD buff duration not tracked — system records cast time only. Fix: use `spellEffectData[spellId].durationSeconds` to compute buff end time                      | `enemyCDs.ts`                              |
| B11 | Defensive cleanse responsibility static by spec — no talent validation. Fix: `canDefensiveCleanse(unit, debuffType)` equivalent of `canOffensivePurge`                | `dispelAnalysis.ts`                        |

---

## Features (Done / N/A)

| #   | Sprint | Description                                                                                                                                                                                                                       | File(s)                                   |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| F1  | —      | Cooldown Usage Analysis                                                                                                                                                                                                           | `cooldowns.ts`                            |
| F2  | —      | Enemy CD Timeline                                                                                                                                                                                                                 | `enemyCDs.ts`                             |
| F3  | —      | Dampening Curve                                                                                                                                                                                                                   | `dampening.ts`                            |
| F4  | —      | Panic Trading & Overlap Detection                                                                                                                                                                                                 | `cooldowns.ts`                            |
| F5  | —      | Dispel Analysis (cleanse + purge)                                                                                                                                                                                                 | `dispelAnalysis.ts`                       |
| F6  | —      | Healing Gap Detection                                                                                                                                                                                                             | `healingGaps.ts`                          |
| F7  | —      | CC & Trinket Analysis                                                                                                                                                                                                             | `ccTrinketAnalysis.ts`                    |
| F8  | —      | AI Test Page (`/local/ai`)                                                                                                                                                                                                        | `local/ai/page.tsx`                       |
| F9  | S1     | Prompt rewrite — constrained evaluator, top-3 output, uncertainty language                                                                                                                                                        | `analyze.ts`                              |
| F10 | S1     | Context restructure — CRITICAL MOMENTS format with enemy state cross-reference                                                                                                                                                    | `CombatAIAnalysis/index.tsx`              |
| F11 | S1     | Purge blame attribution — explicitly state who can purge in context                                                                                                                                                               | `CombatAIAnalysis/index.tsx`              |
| F21 | S2     | Dispel/purge priority scoring — cleanse CD state + what was traded; purge CD state for CD-gated specs; expected buff duration; team pressure during purge miss                                                                    | `dispelAnalysis.ts`                       |
| F28 | S1     | Data source audit — per-feature data quality table. See `DATA_AUDIT.md`.                                                                                                                                                          | `all utils`                               |
| F29 | —      | Reference benchmark pipeline — download high-rated public match logs, extract per-spec CD usage rates, HPS/DPS, dispel counts, panic rates into static JSON corpus. Run: `npm run -w @wowarenalogs/tools start:collectBenchmarks` | `packages/tools/src/collectBenchmarks.ts` |
| F30 | —      | 2D LoS / positioning analysis — X/Y positions + hardcoded 2D pillar geometry per arena. Z-axis not modelled. All 16 arenas have obstacle geometry.                                                                                | `losAnalysis.ts`, `arenaGeometry.ts`      |
| F31 | —      | 🚫 CD rotation simulation — handled via prompt engineering, not code.                                                                                                                                                             | —                                         |
| F32 | —      | 🚫 Ping / latency detection — log timestamps are server-side only.                                                                                                                                                                | —                                         |
| F33 | —      | 🚫 Pre-match setup state — impossible to know CDs used before log initialisation.                                                                                                                                                 | —                                         |
