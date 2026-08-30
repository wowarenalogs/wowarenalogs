# printMatchPrompts — AI prompt inspection tool

Downloads arena matches and prints the full prompt string sent to Claude for each one — same pipeline as `buildMatchContext()` in `CombatAIAnalysis`. Useful for inspecting prompt quality, testing system prompt changes, or collecting AI responses in bulk.

```bash
npm run -w @wowarenalogs/tools start:printMatchPrompts [-- <flags>]
```

## Flags

| Flag               | Default              | Description                                                                                                                                                                                             |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--count <n>`      | `10`                 | Number of match stubs to fetch from the cloud API.                                                                                                                                                      |
| `--bracket <name>` | `Rated Solo Shuffle` | Bracket filter passed to the GraphQL query. Examples: `3v3`, `2v2`, `Rated Solo Shuffle`.                                                                                                               |
| `--local`          | off                  | Read logs from `~/Downloads/wow logs/` instead of the cloud. All `WoWCombatLog*.txt` files in that directory are scanned. Override the directory with the `LOG_DIR` env var.                            |
| `--ai`             | off                  | Call Claude after each match and print the AI response. Requires `ANTHROPIC_API_KEY` in `packages/web/.env.local` or the environment.                                                                   |
| `--test-prompt`    | off                  | (requires `--ai`) Appends a `## Prompt Feedback` meta-reflection section to each AI response — asks Claude to rate which data sections were most/least useful. For internal prompt quality review only. |
| `--healer`         | off                  | Force the log owner perspective to be the healer in the match. By default the script picks a non-healer DPS as the log owner.                                                                           |

## Environment variables

| Variable            | Description                                                                             |
| ------------------- | --------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Required for `--ai`. Can be set in `packages/web/.env.local` or exported in the shell.  |
| `LOG_DIR`           | Override the local log directory used by `--local`. Defaults to `~/Downloads/wow logs`. |

## Examples

```bash
# Print prompts for 5 cloud matches (no AI call)
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 5

# Print prompts + AI responses for 3 healer games from cloud
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 3 --ai --healer

# Print + AI + prompt feedback section for 3 healer games
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 3 --ai --test-prompt --healer

# Read local logs, print prompts only
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --local

# Read local logs, call AI, filter from custom directory
LOG_DIR=~/arena-logs npm run -w @wowarenalogs/tools start:printMatchPrompts -- --local --ai

# Fetch 3v3 matches instead of Solo Shuffle
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 5 --bracket 3v3
```

---

# Generating new spell effects data

This document outlines how to generate the spellEffects.json file used by WAL for cooldown and duration information of spells

Spell DB2 data is now pulled directly from https://wago.tools during generation.
The default build is defined in `src/wagoConfig.ts`; override with environment variable `WAGO_BUILD`.

Key source endpoints include:

- https://wago.tools/db2/Spell/csv
- https://wago.tools/db2/SpellMisc/csv

The generator also pulls related DB2 tables required for reconstruction (SpellCooldowns, SpellDuration, SpellCategory, SpellCategories, SpellCastTimes, SpellEffect, SpellName, SpellMisc).

`spellEffects.json` fields are reconstructed from DB2 as follows:

- `name`: `SpellName.Name_lang` by `SpellID`
- `cooldownSeconds`: `SpellCooldowns.RecoveryTime` (fallback `CategoryRecoveryTime`) by `SpellID`
- `charges`: `SpellCategories.ChargeCategory` -> `SpellCategory.MaxCharges` and `SpellCategory.ChargeRecoveryTime`
- `durationSeconds`: `SpellMisc.DurationIndex` -> `SpellDuration.Duration`

`SpellCastTimes` and `SpellEffect` are also pulled for parity with the old extract workflow and for coverage validation while generating.

## 1. Run the effects json generator

From the wowarenalogs repo root, run:

```
npm run start:generateSpellsData
```

This downloads fresh DB2 CSV data from wago.tools and writes a brand new `packages/shared/src/data/spellEffects.json`.

## 2. Generate spell id lists from DB2 flags

From the wowarenalogs repo root, run:

```
npm run start:generateSpellIdLists
```

This downloads `Spell.csv` and `SpellMisc.csv` and writes `packages/shared/src/data/spellIdLists.json` with:

- `allSpellIds` (all ids from `Spell.csv`)
- `importantSpellIds` (SimC spell attribute `491`)
- `externalDefensiveSpellIds` (SimC spell attribute `499`)
- `bigDefensiveSpellIds` (SimC spell attribute `512`)
- `externalOrBigDefensiveSpellIds` (union of external + big defensive)

# Running a sim log

Create a .env file in the /tools folder to hold the following values:

```
OUTPUT_PATH="C:\\Program Files (x86)\\World of Warcraft\\_retail_\\Logs\\"
INPUT_PATH="C:\\Program Files (x86)\\World of Warcraft\\_retail_\\Logs\\WoWCombatLog-102323_201518.txt"
BUFFER_SLEEP_MS=1000
CHUNK_SIZE=1000
```

Make the appropriate changes for your local file system!

```
npm run start:simlog
```

CHUNK_SIZE determines how many lines will be written per chunk of file

BUFFER_SLEEP_MS determines the sleep time between writing file chunks
