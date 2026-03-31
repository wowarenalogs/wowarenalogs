Update `packages/shared/src/data/` with the latest WoW patch data from wago.tools.

## Steps

### 1. Check the current build version

Read `packages/shared/src/data/spellIdLists.json` and extract the build version from the `sources.spellCsv` URL (the `build=` query parameter). Note this as `CURRENT_BUILD`.

### 2. Find the latest retail build

Fetch `https://wago.tools/api/builds?branch=retail&product=wow` (GET, JSON response).
- Look for the entry with the highest build number (the `version` field, e.g. `"11.1.5.60000"`).
- Note this as `LATEST_BUILD`.

If the fetch fails, fall back to asking the user: "What is the latest WoW retail build? (e.g. 11.1.5.60000)"

### 3. Compare and decide

If `CURRENT_BUILD == LATEST_BUILD`:
- Report: "Data is already up to date (build `CURRENT_BUILD`)."
- Stop here.

Otherwise:
- Report: "Found newer build: `LATEST_BUILD` (currently on `CURRENT_BUILD`). Updating…"

### 4. Run the data generation scripts

Run the following scripts **in order** from the repo root, setting `WAGO_BUILD=LATEST_BUILD`:

```bash
# 1. Regenerate spell ID lists (spellIdLists.json)
cd <repo-root> && WAGO_BUILD=<LATEST_BUILD> npx ts-node --files --project packages/tools/tsconfig.json packages/tools/src/generateSpellIdLists.ts

# 2. Regenerate spell effects data (spellEffects.json)
cd <repo-root> && WAGO_BUILD=<LATEST_BUILD> npx ts-node --files --project packages/tools/tsconfig.json packages/tools/src/generateSpellsData.ts
```

> Note: Use `npx ts-node` directly (not `npm run -w`) — the workspace npm script fails because hoisted `node_modules` aren't found by ts-node in that context.

Each script may take 30–60 seconds (fetches large CSV files from wago.tools). Wait for each to finish before running the next.

If a script fails:
- Show the error output
- Stop and report the failure to the user; do NOT continue to the next script

### 5. Summarize changes

After both scripts succeed, run:
```bash
git diff --stat packages/shared/src/data/
```

Report a summary:
- Which files changed
- The old vs new build version
- Key counts from the script output (e.g. `allSpellIds: 123456`, `importantSpellIds: 456`)

## Notes

- Scripts live in `packages/tools/src/` and are run via npm workspace scripts
- The `WAGO_BUILD` env var overrides the hardcoded default build in each script
- `spellIdLists.json` and `spellEffects.json` are the primary outputs; `spellIdListsReview/` contains human-readable review files
- `spells.json` (BigDebuffs-sourced spell tags) has its own script `start:refreshSpellMetadata` — only run it if the user explicitly asks to update spell tags too
- After updating, you may want to rebuild: `npm run build:web`
