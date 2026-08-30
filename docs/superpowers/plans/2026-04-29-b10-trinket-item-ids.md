# B10: Trinket Item IDs — Data-Driven Generation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded `ADAPTATION_ITEM_IDS` and `RELENTLESS_ITEM_IDS` in `ccTrinketAnalysis.ts` with a generated JSON data file that is refreshed each WoW patch via a tools script, so new season trinkets are always recognized.

**Architecture:** A new tools script (`generateTrinketItemIds.ts`) fetches two wago.tools DB2 CSVs — `ItemEffect` (to find items that trigger the Adaptation proc spell 195756) and `ItemSparse` (to find trinket-slot items whose name contains "Relentless") — and writes `packages/shared/src/data/trinketItemIds.json`. `ccTrinketAnalysis.ts` imports from that JSON instead of hardcoded sets. Tests mock the JSON import so they validate detection behavior without depending on real item IDs and produce a RED state before the import refactor.

**Tech Stack:** TypeScript, node-fetch, fs-extra, ts-node, Jest (mocked JSON import), wago.tools DB2 CSV API.

---

## File Map

| File                                                            | Action             | Responsibility                                                   |
| --------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------- |
| `packages/tools/src/generateTrinketItemIds.ts`                  | Create             | Fetches ItemEffect + ItemSparse CSVs, writes trinketItemIds.json |
| `packages/shared/src/data/trinketItemIds.json`                  | Create (generated) | Canonical list of Adaptation and Relentless item IDs             |
| `packages/shared/src/utils/ccTrinketAnalysis.ts`                | Modify             | Export `detectTrinketType`; swap hardcoded sets for JSON import  |
| `packages/shared/src/utils/__tests__/ccTrinketAnalysis.test.ts` | Create             | Unit tests for `detectTrinketType` using mocked JSON             |
| `packages/tools/src/generateDataManifest.ts`                    | Modify             | Register trinketItemIds.json in TRACKED_FILES                    |
| `packages/tools/package.json`                                   | Modify             | Add `start:generateTrinketItemIds` script                        |
| `packages/shared/src/data/.gitkeep`                             | No change          | JSON file must be committed, not gitignored                      |

---

## Task 1: Export `detectTrinketType` from ccTrinketAnalysis.ts

**Files:**

- Modify: `packages/shared/src/utils/ccTrinketAnalysis.ts:96`

- [ ] **Step 1: Add `export` to `detectTrinketType`**

Change line 96 in `ccTrinketAnalysis.ts` from:

```typescript
function detectTrinketType(unit: ICombatUnit): TrinketType {
```

to:

```typescript
export function detectTrinketType(unit: ICombatUnit): TrinketType {
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /path/to/repo && npx tsc --noEmit -p packages/shared/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/utils/ccTrinketAnalysis.ts
git commit -m "refactor(ccTrinket): export detectTrinketType for unit testing"
```

---

## Task 2: Write failing unit tests for `detectTrinketType`

Tests mock `../data/trinketItemIds.json` so they describe DESIRED behavior after the refactor. The test with `'TEST_ADAPT_1'` currently FAILS because the hardcoded `ADAPTATION_ITEM_IDS` set does not contain that ID — it falls through to `'Gladiator'`.

**Files:**

- Create: `packages/shared/src/utils/__tests__/ccTrinketAnalysis.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitSpec } from '@wowarenalogs/parser';

import { detectTrinketType } from '../ccTrinketAnalysis';
import { makeUnit } from './testHelpers';

// Mock the generated JSON so tests never depend on real item IDs.
jest.mock('../../data/trinketItemIds.json', () => ({
  adaptationItemIds: ['TEST_ADAPT_1', '181816'],
  relentlessItemIds: ['TEST_RELENTLESS_1', '181335'],
}));

// Builds an ICombatUnit with specific item IDs at trinket slots (indices 12 and 13).
function unitWithTrinket(slot12Id: string | null, slot13Id: string | null = null) {
  const equipment: any[] = Array(14).fill(undefined);
  if (slot12Id) equipment[12] = { id: slot12Id, ilvl: 450, enchants: [], bonuses: [], gems: [] };
  if (slot13Id) equipment[13] = { id: slot13Id, ilvl: 450, enchants: [], bonuses: [], gems: [] };
  return makeUnit('p1', {
    spec: CombatUnitSpec.Paladin_Holy,
    info: { equipment } as any,
  });
}

describe('detectTrinketType', () => {
  it('returns Adaptation when slot 12 matches an Adaptation item ID', () => {
    expect(detectTrinketType(unitWithTrinket('TEST_ADAPT_1'))).toBe('Adaptation');
  });

  it('returns Adaptation for legacy ID 181816 still present in JSON', () => {
    expect(detectTrinketType(unitWithTrinket('181816'))).toBe('Adaptation');
  });

  it('returns Relentless when slot 12 matches a Relentless item ID', () => {
    expect(detectTrinketType(unitWithTrinket('TEST_RELENTLESS_1'))).toBe('Relentless');
  });

  it('returns Relentless for legacy ID 181335 still present in JSON', () => {
    expect(detectTrinketType(unitWithTrinket('181335'))).toBe('Relentless');
  });

  it('returns Gladiator when equipment is present but ID is not in either set', () => {
    expect(detectTrinketType(unitWithTrinket('99999'))).toBe('Gladiator');
  });

  it('returns Unknown when unit has no equipment info', () => {
    const unit = makeUnit('p1', { spec: CombatUnitSpec.Paladin_Holy, info: undefined });
    expect(detectTrinketType(unit)).toBe('Unknown');
  });

  it('returns Unknown when equipment array is empty', () => {
    const unit = makeUnit('p1', {
      spec: CombatUnitSpec.Paladin_Holy,
      info: { equipment: [] } as any,
    });
    expect(detectTrinketType(unit)).toBe('Unknown');
  });

  it('checks slot 13 as well as slot 12', () => {
    expect(detectTrinketType(unitWithTrinket(null, 'TEST_ADAPT_1'))).toBe('Adaptation');
  });

  it('Relentless check takes precedence over Adaptation (first match wins)', () => {
    // Relentless check runs first in detectTrinketType
    expect(detectTrinketType(unitWithTrinket('TEST_RELENTLESS_1', 'TEST_ADAPT_1'))).toBe('Relentless');
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd /path/to/repo && npm run test -w @wowarenalogs/shared -- --testPathPattern="ccTrinketAnalysis"
```

Expected: `FAIL` — `detectTrinketType(unitWithTrinket('TEST_ADAPT_1'))` returns `'Gladiator'` (hardcoded sets don't contain `TEST_ADAPT_1`), not `'Adaptation'`. Several tests fail.

---

## Task 3: Create `generateTrinketItemIds.ts` tools script

This script fetches wago.tools DB2 CSVs:

- `ItemEffect` — each row links an item to a spell. Filter for `SpellID = 195756` (the Adaptation auto-break proc) to get all Adaptation item IDs.
- `ItemSparse` — each row is an item with metadata. Filter for `InventoryType = 12` (trinket) AND `Display_lang` contains `"Relentless"` to get Relentless item IDs.

> **Note when running:** Verify that the CSV header row for `ItemEffect` uses `ParentItemID` as the item ID column (print `Object.keys(rows[0])` in `main` if unsure). Some older DB2 builds used `ItemID`. Update the constant `ITEM_EFFECT_ITEM_ID_COL` if needed.

**Files:**

- Create: `packages/tools/src/generateTrinketItemIds.ts`

- [ ] **Step 1: Create the script**

```typescript
/* eslint-disable no-console */
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

import { WAGO_BUILD, withBuild } from './wagoConfig';

/** Spell ID for the Adaptation auto-break proc — verified from ccTrinketAnalysis.ts */
const ADAPTATION_PROC_SPELL_ID = '195756';

/**
 * Column name in ItemEffect CSV for the owning item ID.
 * wago.tools builds 10.x–12.x use "ParentItemID". Change to "ItemID" if the CSV
 * header shows something different (print Object.keys(rows[0]) to verify).
 */
const ITEM_EFFECT_ITEM_ID_COL = 'ParentItemID';

type CsvRow = Record<string, string>;

function parseCsvRows(csv: string): CsvRow[] {
  const lines = csv.split('\n');
  if (lines.length < 2) throw new Error('CSV payload appears empty.');
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',');
    const row: CsvRow = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').replace(/^"|"$/g, '');
    });
    rows.push(row);
  }
  return rows;
}

async function loadCsv(url: string): Promise<CsvRow[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return parseCsvRows(await res.text());
}

function uniqueSortedIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => /^\d+$/.test(id)))).sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10),
  );
}

async function main() {
  console.log(`Fetching ItemEffect + ItemSparse CSVs from wago.tools (build=${WAGO_BUILD})`);

  const [itemEffectRows, itemSparseRows] = await Promise.all([
    loadCsv(withBuild('ItemEffect')),
    loadCsv(withBuild('ItemSparse')),
  ]);

  // Adaptation: items whose on-equip or proc spell is the Adaptation break (195756)
  const adaptationItemIds = uniqueSortedIds(
    itemEffectRows
      .filter((r) => r['SpellID'] === ADAPTATION_PROC_SPELL_ID)
      .map((r) => r[ITEM_EFFECT_ITEM_ID_COL])
      .filter(Boolean),
  );

  // Relentless: trinket-slot items whose English name contains "Relentless"
  const relentlessItemIds = uniqueSortedIds(
    itemSparseRows
      .filter((r) => r['InventoryType'] === '12' && (r['Display_lang'] ?? '').includes('Relentless'))
      .map((r) => r['ID'])
      .filter(Boolean),
  );

  const output = {
    generatedAt: new Date().toISOString(),
    sources: {
      itemEffectCsv: withBuild('ItemEffect'),
      itemSparseCsv: withBuild('ItemSparse'),
    },
    adaptationSpellId: ADAPTATION_PROC_SPELL_ID,
    adaptationItemIds,
    relentlessItemIds,
  };

  const outputPath = path.resolve(__dirname, '../../shared/src/data/trinketItemIds.json');
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`Adaptation item IDs (${adaptationItemIds.length}): ${adaptationItemIds.join(', ')}`);
  console.log(`Relentless item IDs (${relentlessItemIds.length}): ${relentlessItemIds.join(', ')}`);
  console.log(`Wrote trinketItemIds.json to ${outputPath}`);
}

main();
```

- [ ] **Step 2: Verify the script compiles**

```bash
cd /path/to/repo && npx tsc --noEmit -p packages/tools/tsconfig.json 2>/dev/null || echo "No tools tsconfig — checking via ts-node dry run"
```

Expected: no TypeScript errors.

---

## Task 4: Add npm script for `generateTrinketItemIds`

**Files:**

- Modify: `packages/tools/package.json`
- Modify: root `package.json`

- [ ] **Step 1: Add script to tools package**

In `packages/tools/package.json`, inside `"scripts"`, add after `"start:generateSpellIdLists"`:

```json
"start:generateTrinketItemIds": "ts-node --files ./src/generateTrinketItemIds.ts",
```

- [ ] **Step 2: Add pass-through script to root package.json**

In the root `package.json`, inside `"scripts"`, add after `"start:generateSpellIdLists"`:

```json
"start:generateTrinketItemIds": "npm run start:generateTrinketItemIds --workspaces --if-present",
```

- [ ] **Step 3: Commit**

```bash
git add packages/tools/package.json package.json
git commit -m "chore(tools): add start:generateTrinketItemIds npm script"
```

---

## Task 5: Run the script to generate `trinketItemIds.json`

**Files:**

- Create: `packages/shared/src/data/trinketItemIds.json` (generated artifact)

- [ ] **Step 1: Run the generator**

```bash
cd /path/to/repo && npm run start:generateTrinketItemIds
```

Expected output (approximate):

```
Fetching ItemEffect + ItemSparse CSVs from wago.tools (build=12.0.x.xxxxx)
Adaptation item IDs (15+): 181816, 184054, 186871, ...
Relentless item IDs (8+): 181335, 184053, 186870, ...
Wrote trinketItemIds.json to .../packages/shared/src/data/trinketItemIds.json
```

Verify that the output includes the legacy IDs from the old hardcoded sets:

- All 14 IDs from the old `ADAPTATION_ITEM_IDS` should appear in `adaptationItemIds`
- All 8 IDs from the old `RELENTLESS_ITEM_IDS` should appear in `relentlessItemIds`

If the `ParentItemID` column lookup returns empty IDs, the column name is wrong. Re-run with this diagnostic line temporarily added before the filter in `main`:

```typescript
console.log('ItemEffect columns:', Object.keys(itemEffectRows[0] ?? {}));
```

Then update `ITEM_EFFECT_ITEM_ID_COL` to match the actual column name and re-run.

- [ ] **Step 2: Verify JSON structure**

```bash
cat packages/shared/src/data/trinketItemIds.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('Adaptation:', len(d['adaptationItemIds']), 'Relentless:', len(d['relentlessItemIds']))"
```

Expected: both counts are ≥ 8 (at minimum, the legacy IDs should be present).

- [ ] **Step 3: Commit the generated file**

```bash
git add packages/shared/src/data/trinketItemIds.json
git commit -m "chore(data): generate trinketItemIds.json from wago.tools DB2"
```

---

## Task 6: Refactor `ccTrinketAnalysis.ts` to import from JSON

This replaces the hardcoded sets with the generated data. After this change, the tests from Task 2 should turn GREEN.

**Files:**

- Modify: `packages/shared/src/utils/ccTrinketAnalysis.ts`

- [ ] **Step 1: Add JSON import and replace hardcoded sets**

At the top of `ccTrinketAnalysis.ts`, after the existing imports, add:

```typescript
import trinketItemIdsData from '../data/trinketItemIds.json';
```

Replace lines 18–35 (the hardcoded `RELENTLESS_ITEM_IDS` and `ADAPTATION_ITEM_IDS` declarations) with:

```typescript
/** Item IDs for Relentless (passive DR, no active) — generated by start:generateTrinketItemIds */
const RELENTLESS_ITEM_IDS = new Set<string>(trinketItemIdsData.relentlessItemIds);
/** Item IDs for Adaptation (auto-break on 5s CC, no manual cast) — generated by start:generateTrinketItemIds */
const ADAPTATION_ITEM_IDS = new Set<string>(trinketItemIdsData.adaptationItemIds);
```

The full file header section should now look like:

```typescript
import { ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import trinketItemIdsData from '../data/trinketItemIds.json';
import { ccSpellIds } from '../data/spellTags';
import { fmtTime, isHealerSpec, specToString } from './cooldowns';
import { computeIncomingDR, IDRInfo } from './drAnalysis';
import { distanceBetween, getUnitPositionAtTime, hasLineOfSight } from './losAnalysis';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Gladiator's Medallion — active PvP trinket that breaks CC */
const GLADIATOR_TRINKET_SPELL_ID = '336126';
/** Adaptation — passive auto-break trinket (proc spell) */
const ADAPTATION_TRINKET_SPELL_ID = '195756';

/** Item IDs for Relentless (passive DR, no active) — generated by start:generateTrinketItemIds */
const RELENTLESS_ITEM_IDS = new Set<string>(trinketItemIdsData.relentlessItemIds);
/** Item IDs for Adaptation (auto-break on 5s CC, no manual cast) — generated by start:generateTrinketItemIds */
const ADAPTATION_ITEM_IDS = new Set<string>(trinketItemIdsData.adaptationItemIds);
```

- [ ] **Step 2: Run tests — verify they all PASS**

```bash
cd /path/to/repo && npm run test -w @wowarenalogs/shared -- --testPathPattern="ccTrinketAnalysis"
```

Expected: `PASS` — all 9 tests in `ccTrinketAnalysis.test.ts` pass. The mock intercepts the JSON import and provides test-controlled IDs, so the function classifies correctly.

- [ ] **Step 3: Run full shared test suite to check for regressions**

```bash
npm run test -w @wowarenalogs/shared
```

Expected: all tests pass.

- [ ] **Step 4: TypeScript clean compile**

```bash
npx tsc --noEmit -p packages/shared/tsconfig.json
```

Expected: no errors.

- [ ] **Step 5: Lint**

```bash
npm run lint -w @wowarenalogs/shared
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/utils/ccTrinketAnalysis.ts packages/shared/src/utils/__tests__/ccTrinketAnalysis.test.ts
git commit -m "fix(ccTrinket): load trinket item IDs from generated JSON instead of hardcoded sets (B10)"
```

---

## Task 7: Register `trinketItemIds.json` in `generateDataManifest.ts`

**Files:**

- Modify: `packages/tools/src/generateDataManifest.ts`

- [ ] **Step 1: Add entry to TRACKED_FILES array**

In `generateDataManifest.ts`, inside the `TRACKED_FILES` array, add after the `spellIdLists.json` entry (around line 35):

```typescript
  {
    file: 'trinketItemIds.json',
    description: 'Adaptation and Relentless PvP trinket item IDs from Wago.tools ItemEffect + ItemSparse DB2',
    generatedBy: 'npm run start:generateTrinketItemIds (packages/tools)',
    wowDataDependent: true,
  },
```

- [ ] **Step 2: Run the manifest generator to confirm it picks up the new file**

```bash
cd /path/to/repo && npm run -w @wowarenalogs/tools start:generateDataManifest
```

Expected: output includes a line like `trinketItemIds.json: 2 entries, last updated ...` (2 keys at root: adaptationItemIds, relentlessItemIds — the entryCount reflects top-level key count).

- [ ] **Step 3: Commit manifest changes**

```bash
git add packages/tools/src/generateDataManifest.ts packages/shared/src/data/dataManifest.json
git commit -m "chore(tools): register trinketItemIds.json in data manifest"
```

---

## Self-Review

**Spec coverage:**

- ✅ Hardcoded `ADAPTATION_ITEM_IDS` replaced with JSON import
- ✅ Hardcoded `RELENTLESS_ITEM_IDS` replaced with JSON import
- ✅ New season trinkets: recognized on next `start:generateTrinketItemIds` run
- ✅ Generation script follows established `wagoConfig.ts` / wago.tools CSV pattern
- ✅ Registered in `dataManifest.json` so staleness is visible
- ✅ npm script added for developer discoverability
- ✅ Tests cover both legacy IDs and novel test IDs via mock injection

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:**

- `trinketItemIdsData.adaptationItemIds` is `string[]` (JSON array) → `new Set<string>(...)` — correct
- `trinketItemIdsData.relentlessItemIds` is `string[]` — same pattern
- `detectTrinketType` signature unchanged; return type `TrinketType` unchanged

**Edge cases verified:**

- Script output missing legacy IDs: Task 5 Step 1 includes an explicit verification check against the old hardcoded lists
- Wrong CSV column name for item ID: Task 5 Step 1 includes a diagnostic fallback
- No Relentless items returned (name filter too strict): count check in Task 5 Step 2 catches this (count must be ≥ 8)
