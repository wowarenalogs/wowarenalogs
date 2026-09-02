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

## Simulating partial lines

By default each line is written whole, so the file is newline-aligned at every
moment a watcher could look at it. Real wow flushes a buffer that ends wherever it
ends, so a reader can catch the file part way through a line. Set `PARTIAL_LINES=1`
to reproduce that:

```
PARTIAL_LINES=1
FLUSH_SLEEP_MS=250
```

Each chunk is then written as two flushes cut inside the chunk's last line, with
`FLUSH_SLEEP_MS` between them so the watcher has time to fire and read while the
line is still incomplete. Lower it and the two flushes may land before anything
looks at the file, which makes the split invisible and the run indistinguishable
from the default mode.

Both flushes are needed, not just the mid-line one: a reader that buffers the
fragment has to be handed a following flush that ends exactly on a newline, which
is where boundary handling tends to go wrong. Writing at some fixed byte size
instead is not enough — if every flush ends mid-line, a reader that keeps only the
most recent fragment never gets the chance to misuse a stale one.
