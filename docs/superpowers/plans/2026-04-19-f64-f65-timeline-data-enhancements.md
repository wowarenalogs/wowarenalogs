# F64 + F65 Timeline Data Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add enemy HP to `[HP]` ticks (F64) and replace the healer-only spell whitelist with a data-driven lookup for all owner spells with CD ≥30s (F65).

**Architecture:** F64 adds an optional `enemies` parameter to `buildMatchTimeline`, includes enemy units in the existing HP tick loop using `enemyPid()`, and expands critical windows to include enemy deaths. F65 introduces a new `generateSpellCooldowns.ts` tool that fetches `SpellCooldowns` + `SpellName` DBC tables from Wago.tools, generates `spellCooldowns.json` (spellId → {name, baseCooldownSeconds}), and replaces the hardcoded `HEALER_CAST_SPELL_ID_TO_NAME` whitelist + `isHealer` gate with a data-driven lookup.

**Tech Stack:** TypeScript, `node-fetch`, `fs-extra`, Wago.tools DB2 CSV API, Jest

---

## File Map

| Action | File                                                                                      | Change                                                                  |
| ------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | F64: add `enemies?` param + HP loop. F65: replace whitelist with lookup |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`                  | F64: pass `enemies` at call site                                        |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Tests for F64 + F65                                                     |
| Create | `packages/tools/src/generateSpellCooldowns.ts`                                            | F65: fetch + filter + write spellCooldowns.json                         |
| Create | `packages/shared/src/data/spellCooldowns.json`                                            | F65: generated data file, committed to repo                             |

---

## Task 1: F64 — Add `enemies` param to `BuildMatchTimelineParams` and pass it at the call site

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`

- [ ] **Step 1: Add `enemies?` to the interface in `utils.ts`**

In `BuildMatchTimelineParams` (currently around line 1111), add after `friends: ICombatUnit[];`:

```ts
enemies?: ICombatUnit[];
```

- [ ] **Step 2: Destructure `enemies` in `buildMatchTimeline`**

In the destructuring block at the top of `buildMatchTimeline` (currently around line 1141), add `enemies` alongside `friends`:

```ts
const {
  owner,
  ownerSpec,
  ownerCDs,
  teammateCDs,
  enemyCDTimeline,
  ccTrinketSummaries,
  dispelSummary,
  friendlyDeaths,
  enemyDeaths,
  pressureWindows,
  healingGaps,
  friends,
  enemies, // ← add this
  matchStartMs,
  matchEndMs,
  isHealer,
  playerIdMap,
  enemyIdMap,
} = params;
```

- [ ] **Step 3: Pass `enemies` at the call site in `index.tsx`**

In `buildMatchContext` in `index.tsx`, the `buildMatchTimeline` call (around line 215) already has access to `enemies` (it's a parameter of `buildMatchContext`). Add it to the call:

```ts
buildMatchTimeline({
  owner: owner as ICombatUnit,
  ownerSpec,
  ownerCDs: cooldowns,
  teammateCDs: allTeamCDsWithSpec,
  enemyCDTimeline,
  ccTrinketSummaries,
  dispelSummary,
  friendlyDeaths,
  enemyDeaths,
  pressureWindows,
  healingGaps,
  friends: friends as ICombatUnit[],
  enemies: enemies as ICombatUnit[], // ← add this line
  matchStartMs: combat.startTime,
  matchEndMs: combat.endTime,
  isHealer: healer,
  playerIdMap,
  enemyIdMap,
} as BuildMatchTimelineParams);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run build:web 2>&1 | tail -20
```

Expected: no new TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx
git commit -m "feat(F64): add enemies param to BuildMatchTimelineParams and call site"
```

---

## Task 2: F64 — Add enemy deaths to critical windows + include enemy HP in ticks

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Write failing test — enemy HP appears in [HP] lines**

At the end of the `buildMatchTimeline — [DEATH] events` describe block in `timeline.test.ts`, add:

```ts
describe('buildMatchTimeline — F64 enemy HP', () => {
  it('includes enemy HP in [HP] lines when enemies are provided', () => {
    const matchStartMs = 0;
    const enemy = makeUnit('enemy-1', {
      name: 'Natjkis',
      advancedActions: [
        { ...makeAdvancedAction(6_000, 0, 0, 500_000, 350_000), advancedActorId: 'enemy-1' }, // 70% at t=6s
      ],
    });
    const { enemyIdMap } = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [],
      [],
      makeEnemyTimeline([
        {
          playerName: 'Natjkis',
          specName: 'Affliction Warlock',
          offensiveCDs: [
            {
              spellId: '980',
              spellName: 'Agony',
              castTimeSeconds: 5,
              cooldownSeconds: 90,
              availableAgainAtSeconds: 95,
              buffEndSeconds: 25,
            },
          ],
        },
      ]),
    );
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        enemyIdMap,
        matchStartMs,
        matchEndMs: 30_000,
      }),
    );
    expect(result).toMatch(/\[HP\].*Natjkis|Natjkis.*\[HP\]/s);
    const hpLines = result.split('\n').filter((l) => l.includes('[HP]'));
    expect(hpLines.length).toBeGreaterThan(0);
    expect(hpLines.some((l) => l.includes('70%'))).toBe(true);
  });

  it('adds 1s critical window before enemy death', () => {
    const matchStartMs = 0;
    const enemy = makeUnit('enemy-1', {
      name: 'Natjkis',
      advancedActions: [
        { ...makeAdvancedAction(55_000, 0, 0, 500_000, 50_000), advancedActorId: 'enemy-1' }, // 10% near death
        { ...makeAdvancedAction(58_000, 0, 0, 500_000, 10_000), advancedActorId: 'enemy-1' }, // 2%
      ],
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        enemyDeaths: [{ spec: 'Affliction Warlock', name: 'Natjkis', atSeconds: 60 }],
        matchStartMs,
        matchEndMs: 65_000,
      }),
    );
    // Should have ticks at 51, 52, 53 ... 60 (1s resolution) rather than only 51, 54, 57, 60
    const hpLines = result.split('\n').filter((l) => l.includes('[HP]'));
    const tickSeconds = hpLines
      .map((l) => {
        const m = l.match(/^(\d+):(\d+)/);
        return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
      })
      .filter((t): t is number => t !== null);
    // In the 10s window before enemy death (t=50..60) we expect consecutive 1s ticks
    const inWindow = tickSeconds.filter((t) => t >= 50 && t <= 60);
    expect(inWindow.length).toBeGreaterThanOrEqual(5); // at minimum half the 1s ticks present
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test --workspace=@wowarenalogs/shared -- --testPathPattern=timeline --no-coverage 2>&1 | tail -30
```

Expected: both new tests fail (enemy HP not in output, critical windows not expanded).

- [ ] **Step 3: Expand critical windows with enemy deaths in `utils.ts`**

In the critical windows section (after the friendly deaths loop, currently around line 1369), add:

```ts
for (const d of enemyDeaths) {
  for (let t = Math.max(0, Math.ceil(d.atSeconds - 10)); t <= Math.floor(d.atSeconds); t++) {
    criticalWindowSet.add(t);
  }
}
```

- [ ] **Step 4: Include enemy units in HP tick emission in `utils.ts`**

Replace:

```ts
const hpFriends = friends;
```

With:

```ts
const hpUnits: Array<{ unit: ICombatUnit; label: (name: string) => string }> = [
  ...friends.map((u) => ({ unit: u, label: (name: string) => pid(name) })),
  ...(enemies ?? []).map((u) => ({ unit: u, label: (name: string) => enemyPid(name) })),
];
```

Then replace the tick emission loop body. The current loop is:

```ts
for (const t of [...tickSet].sort((a, b) => a - b)) {
  const tsMs = matchStartMs + t * 1000;
  const sampleWindowMs = criticalWindowSet.has(t) ? HP_SAMPLE_WINDOW_CRITICAL_MS : HP_SAMPLE_WINDOW_BASELINE_MS;
  const parts = hpFriends
    .map((u) => {
      const pct = getUnitHpAtTimestamp(u, tsMs, sampleWindowMs);
      return pct !== null ? `${pid(u.name)}:${pct}%` : null;
    })
    .filter((s): s is string => s !== null);
  if (parts.length > 0) {
    addEntry(t, `${fmtTime(t)}  [HP]   ${parts.join(' / ')}`);
  }
}
```

Replace with:

```ts
for (const t of [...tickSet].sort((a, b) => a - b)) {
  const tsMs = matchStartMs + t * 1000;
  const sampleWindowMs = criticalWindowSet.has(t) ? HP_SAMPLE_WINDOW_CRITICAL_MS : HP_SAMPLE_WINDOW_BASELINE_MS;
  const parts = hpUnits
    .map(({ unit, label }) => {
      const pct = getUnitHpAtTimestamp(unit, tsMs, sampleWindowMs);
      return pct !== null ? `${label(unit.name)}:${pct}%` : null;
    })
    .filter((s): s is string => s !== null);
  if (parts.length > 0) {
    addEntry(t, `${fmtTime(t)}  [HP]   ${parts.join(' / ')}`);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test --workspace=@wowarenalogs/shared -- --testPathPattern=timeline --no-coverage 2>&1 | tail -30
```

Expected: all tests pass including the two new F64 tests.

- [ ] **Step 6: Verify full test suite still passes**

```bash
npm test --workspace=@wowarenalogs/shared --no-coverage 2>&1 | tail -20
```

Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat(F64): add enemy HP to [HP] ticks with enemy-death critical windows"
```

---

## Task 3: F65 — Create `generateSpellCooldowns.ts` tool script

**Files:**

- Create: `packages/tools/src/generateSpellCooldowns.ts`

The script fetches two DB2 tables from Wago.tools:

- `SpellCooldowns`: `SpellID`, `DifficultyID`, `RecoveryTime` (ms), `CategoryRecoveryTime` (ms)
- `SpellName`: `SpellID`, `Name_lang`

It filters to `RecoveryTime >= 30000` and `DifficultyID == 0` (base difficulty), then writes `spellCooldowns.json`. NPC filtering is unnecessary — the runtime only calls this lookup on `owner.spellCastEvents`, which are spells a player actually cast.

- [ ] **Step 1: Read `wagoConfig.ts` to confirm import path**

The config is at `packages/tools/src/wagoConfig.ts` and exports:

```ts
export const WAGO_DB2_BASE = 'https://wago.tools/db2';
export const WAGO_BUILD = process.env.WAGO_BUILD || '12.0.1.66838';
export const withBuild = (tableName: string) =>
  `${WAGO_DB2_BASE}/${tableName}/csv?build=${encodeURIComponent(WAGO_BUILD)}`;
```

- [ ] **Step 2: Create `generateSpellCooldowns.ts`**

```ts
/* eslint-disable no-console */
import fs from 'fs-extra';
import fetch from 'node-fetch';
import path from 'path';

import { withBuild } from './wagoConfig';

const SOURCE_TABLES = {
  spellCooldowns: withBuild('SpellCooldowns'),
  spellName: withBuild('SpellName'),
};

const OUT_PATH = path.resolve(__dirname, '../../../shared/src/data/spellCooldowns.json');
const MIN_CD_MS = 30_000;

type CsvRow = Record<string, string>;

function parseCsv(csv: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const next = csv[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (!inQuotes && char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (!inQuotes && char === '\r') continue;
    field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length < 2) throw new Error('CSV appears empty');

  const headers = rows[0];
  return rows.slice(1).map((values) => {
    const result: CsvRow = {};
    headers.forEach((h, i) => {
      result[h] = values[i] ?? '';
    });
    return result;
  });
}

async function loadCsv(url: string): Promise<CsvRow[]> {
  console.log(`Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return parseCsv(await response.text());
}

async function main() {
  const [cdRows, nameRows] = await Promise.all([
    loadCsv(SOURCE_TABLES.spellCooldowns),
    loadCsv(SOURCE_TABLES.spellName),
  ]);

  // Build name map: spellId → name
  const nameMap = new Map<string, string>();
  for (const row of nameRows) {
    const id = row['ID'];
    const name = row['Name_lang'];
    if (id && name) nameMap.set(id, name);
  }

  // Filter to base difficulty (DifficultyID == 0) and RecoveryTime >= 30s
  // When multiple entries exist for a SpellID (different difficulties), take DifficultyID=0.
  const result: Record<string, { name: string; baseCooldownSeconds: number }> = {};
  for (const row of cdRows) {
    const spellId = row['SpellID'];
    const difficultyId = row['DifficultyID'];
    const recoveryMs = parseInt(row['RecoveryTime'] ?? '0', 10);
    if (!spellId || difficultyId !== '0') continue;
    if (recoveryMs < MIN_CD_MS) continue;
    const name = nameMap.get(spellId);
    if (!name) continue;
    result[spellId] = {
      name,
      baseCooldownSeconds: Math.round(recoveryMs / 1000),
    };
  }

  const count = Object.keys(result).length;
  console.log(`Writing ${count} spells with CD ≥ ${MIN_CD_MS / 1000}s to ${OUT_PATH}`);
  await fs.writeJson(OUT_PATH, result, { spaces: 2 });
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add script entry to `packages/tools/package.json`**

Open `packages/tools/package.json`. In the `"scripts"` section, add alongside existing data-generation scripts:

```json
"gen:spell-cooldowns": "ts-node src/generateSpellCooldowns.ts"
```

- [ ] **Step 4: Verify the script compiles**

```bash
cd packages/tools && npx ts-node --transpile-only src/generateSpellCooldowns.ts --help 2>&1 | head -5
```

Expected: no TypeScript errors (the `--help` flag will cause a runtime no-op; we just want compilation to succeed).

Actually, ts-node doesn't support `--help` for scripts. Run:

```bash
cd packages/tools && npx ts-node --transpile-only -e "require('./src/generateSpellCooldowns')" 2>&1 | head -10
```

Expected: starts fetching (or fails with a network error — either way, no TypeScript compile errors).

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/generateSpellCooldowns.ts packages/tools/package.json
git commit -m "feat(F65): add generateSpellCooldowns tool script"
```

---

## Task 4: F65 — Run the script, validate output, commit `spellCooldowns.json`

**Files:**

- Create: `packages/shared/src/data/spellCooldowns.json`

- [ ] **Step 1: Run the script**

```bash
npm run -w @wowarenalogs/tools gen:spell-cooldowns
```

Expected output (approximate):

```
Fetching: https://wago.tools/db2/SpellCooldowns/csv?build=12.0.1.66838
Fetching: https://wago.tools/db2/SpellName/csv?build=12.0.1.66838
Writing NNNN spells with CD ≥ 30s to .../spellCooldowns.json
Done.
```

If the script fails with a network error, verify your internet connection and that `WAGO_BUILD` in `wagoConfig.ts` is a valid build string (check the Wago.tools website for the current retail build).

- [ ] **Step 2: Validate output**

```bash
node -e "
const data = require('./packages/shared/src/data/spellCooldowns.json');
const entries = Object.entries(data);
console.log('Total entries:', entries.length);
const allGte30 = entries.every(([_, v]) => v.baseCooldownSeconds >= 30);
console.log('All CDs >= 30s:', allGte30);
// Spot-check known Arena spell IDs
const checks = {
  '33206': 'Pain Suppression',    // Disc Priest, 3min CD
  '10060': 'Power Infusion',      // Priest, 2min CD
  '31884': 'Avenging Wrath',      // Paladin, 2min CD
  '108280': 'Healing Tide Totem', // Resto Shaman, 3min CD
};
for (const [id, expectedName] of Object.entries(checks)) {
  const entry = data[id];
  console.log(id, entry ? 'FOUND: ' + entry.name + ' (' + entry.baseCooldownSeconds + 's)' : 'MISSING - check if ID is correct for this build');
}
"
```

Expected:

- `Total entries` is in the thousands (WoW has many long-CD spells including boss abilities, but the runtime dedup against `ownerCDs` and player-only context of `spellCastEvents` keeps output manageable)
- `All CDs >= 30s: true`
- All four spot-check IDs found with correct names

If a spot-check ID is missing, verify the spell ID is correct for the current WoW build on Wowhead.

- [ ] **Step 3: Commit the generated file**

```bash
git add packages/shared/src/data/spellCooldowns.json
git commit -m "feat(F65): generate spellCooldowns.json from Wago.tools DBC — $(node -e "const d=require('./packages/shared/src/data/spellCooldowns.json'); console.log(Object.keys(d).length)") spells with CD >= 30s"
```

---

## Task 5: F65 — Replace whitelist with `spellCooldowns.json` lookup in `buildMatchTimeline`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Write failing tests for F65**

Add to `timeline.test.ts`:

```ts
describe('buildMatchTimeline — F65 owner cast log (data-driven)', () => {
  it('emits [OWNER CAST] for a spell in spellCooldowns.json not already in ownerCDs', () => {
    const matchStartMs = 1_000_000;
    // Pain Suppression (spellId 33206) has CD 180s — should appear in spellCooldowns.json
    const PAIN_SUPPRESSION_ID = '33206';
    const castTs = matchStartMs + 30_000;
    const owner = makeUnit('player-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent(PAIN_SUPPRESSION_ID, castTs, 'teammate-1', 'Simplesauce')],
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        ownerCDs: [], // not in ownerCDs — must come through [OWNER CAST]
        matchStartMs,
        matchEndMs: matchStartMs + 120_000,
        isHealer: false, // gate removed — should work for any spec
      }),
    );
    expect(result).toContain('[OWNER CAST]');
    expect(result).toContain('Pain Suppression');
  });

  it('does NOT emit [OWNER CAST] for a spell already tracked in ownerCDs (dedup)', () => {
    const matchStartMs = 1_000_000;
    const PAIN_SUPPRESSION_ID = '33206';
    const castTs = matchStartMs + 30_000;
    const owner = makeUnit('player-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent(PAIN_SUPPRESSION_ID, castTs, 'teammate-1', 'Simplesauce')],
    });
    const trackedCD: IMajorCooldownInfo = {
      spellId: PAIN_SUPPRESSION_ID,
      spellName: 'Pain Suppression',
      tag: 'Defensive',
      cooldownSeconds: 180,
      maxChargesDetected: 1,
      casts: [{ timeSeconds: 30 }],
      availableWindows: [],
      neverUsed: false,
    };
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        ownerCDs: [trackedCD],
        matchStartMs,
        matchEndMs: matchStartMs + 120_000,
      }),
    );
    // Should appear as [OWNER CD] (already tracked), NOT duplicated as [OWNER CAST]
    const ownerCastLines = result
      .split('\n')
      .filter((l) => l.includes('[OWNER CAST]') && l.includes('Pain Suppression'));
    expect(ownerCastLines.length).toBe(0);
  });

  it('does NOT emit [OWNER CAST] for a spell with CD < 30s (not in lookup)', () => {
    const matchStartMs = 1_000_000;
    // Flash Heal (spellId 2061) has no cooldown — should not be in spellCooldowns.json
    const FLASH_HEAL_ID = '2061';
    const owner = makeUnit('player-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent(FLASH_HEAL_ID, matchStartMs + 10_000, 'teammate-1')],
    });
    const result = buildMatchTimeline(makeBaseParams({ owner, matchStartMs, matchEndMs: matchStartMs + 60_000 }));
    expect(result).not.toContain('Flash Heal');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test --workspace=@wowarenalogs/shared -- --testPathPattern=timeline --no-coverage 2>&1 | tail -30
```

Expected: the three new F65 tests fail.

- [ ] **Step 3: Add import for `spellCooldowns.json` in `utils.ts`**

At the top of `utils.ts`, alongside other imports, add:

```ts
import spellCooldownsRaw from '../../../data/spellCooldowns.json';
```

Then immediately after the import block, add the typed constant:

```ts
const spellCooldownsData = spellCooldownsRaw as Record<string, { name: string; baseCooldownSeconds: number }>;
```

- [ ] **Step 4: Replace the `[OWNER CAST]` block in `buildMatchTimeline` in `utils.ts`**

Find the existing `[OWNER CAST]` block (F61, currently under `if (isHealer) {`). It looks like:

```ts
// ── [OWNER CAST] healer gap-filler (F61) ────────────────────────────────────

if (isHealer) {
  const trackedCastsBySpellId = new Map<string, Set<number>>();
  for (const cd of ownerCDs) {
    trackedCastsBySpellId.set(
      cd.spellId,
      new Set(cd.casts.map((c) => matchStartMs + Math.round(c.timeSeconds * 1000))),
    );
  }
  for (const e of owner.spellCastEvents ?? []) {
    if (e.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
    if (!e.spellId) continue;
    const spellName = HEALER_CAST_SPELL_ID_TO_NAME[e.spellId];
    if (!spellName) continue;
    const tsMs = e.logLine.timestamp;
    const trackedSet = trackedCastsBySpellId.get(e.spellId);
    if (trackedSet && (trackedSet.has(tsMs) || trackedSet.has(tsMs - 1000) || trackedSet.has(tsMs + 1000))) continue;
    const timeSeconds = (tsMs - matchStartMs) / 1000;
    addEntry(timeSeconds, `${fmtTime(timeSeconds)}  [OWNER CAST]   ${spellName}`);
  }
}
```

Replace the entire block with:

```ts
// ── [OWNER CAST] — all owner spells with CD ≥ 30s not already in ownerCDs (F65) ──

{
  const trackedCastsBySpellId = new Map<string, Set<number>>();
  for (const cd of ownerCDs) {
    trackedCastsBySpellId.set(
      cd.spellId,
      new Set(cd.casts.map((c) => matchStartMs + Math.round(c.timeSeconds * 1000))),
    );
  }
  for (const e of owner.spellCastEvents ?? []) {
    if (e.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
    if (!e.spellId) continue;
    const spellMeta = spellCooldownsData[e.spellId];
    if (!spellMeta) continue;
    const tsMs = e.logLine.timestamp;
    const trackedSet = trackedCastsBySpellId.get(e.spellId);
    // Allow ±1000ms tolerance to absorb server/client timestamp drift
    if (trackedSet && (trackedSet.has(tsMs) || trackedSet.has(tsMs - 1000) || trackedSet.has(tsMs + 1000))) continue;
    const timeSeconds = (tsMs - matchStartMs) / 1000;
    const target = e.destUnitName && e.destUnitName !== 'nil' ? ` → ${e.destUnitName}` : '';
    addEntry(timeSeconds, `${fmtTime(timeSeconds)}  [OWNER CAST]   ${spellMeta.name}${target}`);
  }
}
```

- [ ] **Step 5: Remove the now-unused `HEALER_CAST_SPELL_ID_TO_NAME` constant**

Delete the entire `const HEALER_CAST_SPELL_ID_TO_NAME: Record<string, string> = { ... }` block at the top of `utils.ts` (currently around lines 34–60). It is now fully replaced by `spellCooldownsData`.

- [ ] **Step 6: Check for `resolveJsonModule` in tsconfig**

```bash
grep -r "resolveJsonModule" packages/shared/tsconfig.json packages/shared/tsconfig.*.json 2>/dev/null
```

If `resolveJsonModule` is not set to `true`, add it:

```json
{
  "compilerOptions": {
    "resolveJsonModule": true
  }
}
```

If it's already present, skip this step.

- [ ] **Step 7: Run tests to verify they pass**

```bash
npm test --workspace=@wowarenalogs/shared -- --testPathPattern=timeline --no-coverage 2>&1 | tail -40
```

Expected: all tests pass including the three new F65 tests.

- [ ] **Step 8: Run full test suite and lint**

```bash
npm test --workspace=@wowarenalogs/shared --no-coverage 2>&1 | tail -20
npm run lint 2>&1 | tail -20
```

Expected: no failures, no lint warnings.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat(F65): replace healer whitelist with data-driven spellCooldowns lookup for [OWNER CAST]"
```

---

## Self-Review

**Spec coverage check:**

- F64 parameter addition → Task 1 ✓
- F64 enemy HP in tick loop → Task 2 (Step 4) ✓
- F64 enemy deaths as critical windows → Task 2 (Step 3) ✓
- F64 `enemyPid()` for name compression → Task 2 (Step 4, `label` closure) ✓
- F65 new tool script → Task 3 ✓
- F65 generate + validate `spellCooldowns.json` → Task 4 ✓
- F65 replace whitelist with lookup → Task 5 (Step 4) ✓
- F65 remove `isHealer` gate → Task 5 (Step 4) ✓
- F65 remove `HEALER_CAST_SPELL_ID_TO_NAME` → Task 5 (Step 5) ✓
- F65 target field in `[OWNER CAST]` → Task 5 (Step 4) ✓
- Tests for F64 → Task 2 (Step 1) ✓
- Tests for F65 → Task 5 (Step 1) ✓

**Type consistency:**

- `hpUnits` uses `{ unit: ICombatUnit; label: (name: string) => string }` — used consistently in Step 4 of Task 2.
- `spellCooldownsData` typed as `Record<string, { name: string; baseCooldownSeconds: number }>` — consistent with JSON schema defined in Task 3.
- `makeAdvancedAction` returns `advancedActorId: 'unit-1'` by default — tests in Task 2 override this with `{ ...makeAdvancedAction(...), advancedActorId: 'enemy-1' }` to match the enemy unit's id.

**Placeholder scan:** None found. All code blocks are complete.
