# F65: Owner Cast Log — All Spells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `[OWNER CAST]` timeline events from a fixed healer spell whitelist to every spell the log owner casts, and add a target label to each entry.

**Architecture:** The existing F61 healer gap-filler block in `buildMatchTimeline` already iterates `owner.spellCastEvents` and deduplicates against `ownerCDs`. F65 removes the `HEALER_CAST_SPELL_ID_TO_NAME` whitelist filter so all `SPELL_CAST_SUCCESS` events are emitted. A new `resolveTarget()` closure (placed alongside `pid()` / `enemyPid()`) resolves each cast's `destUnitName` to `"self"`, a numeric player ID, or the raw name. The `isHealer` gate is kept because all use-cases in the spec are healer-perspective; the canonical name map is kept for pretty display names on known spells.

**Tech Stack:** TypeScript (strict), Jest, existing test helpers (`makeUnit`, `makeSpellCastEvent` from `testHelpers.ts`).

---

## Files

| Action | Path                                                                                      |
| ------ | ----------------------------------------------------------------------------------------- |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` |

---

## Task 1: Update the F61 "non-healer spell" test to reflect F65 behavior

The existing test `'does not emit [OWNER CAST] for non-healer spell IDs'` asserts the whitelist is respected. After F65 the whitelist is no longer a filter, so this test must be rewritten to assert the opposite.

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Open the file and locate the test**

  In `timeline.test.ts`, find the `describe` block labelled `'buildMatchTimeline — [OWNER CAST] (F61 healer gap-filler)'`. The test to change is at approximately line 751:

  ```ts
  it('does not emit [OWNER CAST] for non-healer spell IDs', () => { ... });
  ```

- [ ] **Step 2: Replace the test with the F65 expectation**

  Replace the entire `it(...)` block with:

  ```ts
  it('emits [OWNER CAST] for any spell the owner casts, not just the healer whitelist', () => {
    // Spell ID '9999' is not in HEALER_CAST_SPELL_ID_TO_NAME — after F65 it must still appear.
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('9999', 30_000, 'player-2', 'Simplesauce')],
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).toContain('[OWNER CAST]');
    // spellName echoes spellId in the mock (makeSpellCastEvent sets spellName = spellId)
    expect(result).toContain('9999');
  });
  ```

- [ ] **Step 3: Run the test to confirm it fails (it must — the implementation is unchanged)**

  ```bash
  cd /Users/mingjianliu/code/wowarenalogs
  npm run test -- --testPathPattern=timeline.test.ts 2>&1 | tail -30
  ```

  Expected: the rewritten test FAILS with something like `expected to contain '[OWNER CAST]'`.

- [ ] **Step 4: Commit the failing test**

  ```bash
  git add packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
  git commit -m "test(F65): update F61 whitelist test to assert all-spell emission"
  ```

---

## Task 2: Write new failing tests for F65 target-label behavior

Add a new `describe` block that fully specifies the target-resolution logic before touching the implementation.

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Add the new describe block after the existing F61 block**

  Append the following after the closing `});` of `describe('buildMatchTimeline — [OWNER CAST] (F61 healer gap-filler)', ...)`:

  ```ts
  describe('buildMatchTimeline — F65 [OWNER CAST] target labels', () => {
    it('appends "self" when the owner targets themselves', () => {
      const owner = makeUnit('unit-1', {
        name: 'Feramonk',
        spellCastEvents: [makeSpellCastEvent('1', 30_000, 'unit-1', 'Feramonk')],
      });
      const result = buildMatchTimeline(
        makeBaseParams({
          owner,
          isHealer: true,
          ownerCDs: [],
          matchStartMs: 0,
          matchEndMs: 60_000,
        }),
      );
      expect(result).toContain('[OWNER CAST]');
      expect(result).toContain('→ self');
    });

    it('appends a numeric ID when the target is a known friendly player', () => {
      // playerIdMap: Feramonk=1, Simplesauce=2
      const owner = makeUnit('unit-1', {
        name: 'Feramonk',
        spellCastEvents: [makeSpellCastEvent('1', 30_000, 'unit-2', 'Simplesauce')],
      });
      // Build a playerIdMap matching what buildPlayerLoadout would produce
      const playerIdMap = new Map<string, number>([
        ['Feramonk', 1],
        ['Simplesauce', 2],
      ]);
      const result = buildMatchTimeline(
        makeBaseParams({
          owner,
          isHealer: true,
          ownerCDs: [],
          matchStartMs: 0,
          matchEndMs: 60_000,
          playerIdMap,
        }),
      );
      expect(result).toContain('→ 2');
    });

    it('appends a numeric ID when the target is a known enemy player', () => {
      // enemyIdMap: Natjkis=3
      const owner = makeUnit('unit-1', {
        name: 'Feramonk',
        spellCastEvents: [makeSpellCastEvent('1', 30_000, 'enemy-1', 'Natjkis')],
      });
      const enemyIdMap = new Map<string, number>([['Natjkis', 3]]);
      const result = buildMatchTimeline(
        makeBaseParams({
          owner,
          isHealer: true,
          ownerCDs: [],
          matchStartMs: 0,
          matchEndMs: 60_000,
          enemyIdMap,
        }),
      );
      expect(result).toContain('→ 3');
    });

    it('appends raw target name when the target is not in any ID map', () => {
      const owner = makeUnit('unit-1', {
        name: 'Feramonk',
        spellCastEvents: [makeSpellCastEvent('1', 30_000, 'npc-99', 'SomeNPC')],
      });
      const result = buildMatchTimeline(
        makeBaseParams({
          owner,
          isHealer: true,
          ownerCDs: [],
          matchStartMs: 0,
          matchEndMs: 60_000,
        }),
      );
      expect(result).toContain('→ SomeNPC');
    });

    it('omits the target arrow when destUnitName is empty', () => {
      const owner = makeUnit('unit-1', {
        name: 'Feramonk',
        spellCastEvents: [makeSpellCastEvent('1', 30_000, '', '')],
      });
      const result = buildMatchTimeline(
        makeBaseParams({
          owner,
          isHealer: true,
          ownerCDs: [],
          matchStartMs: 0,
          matchEndMs: 60_000,
        }),
      );
      expect(result).toContain('[OWNER CAST]');
      expect(result).not.toContain('→');
    });

    it('uses the canonical spell name from HEALER_CAST_SPELL_ID_TO_NAME when available', () => {
      // spellId '108280' = Healing Tide Totem — makeSpellCastEvent sets spellName='108280',
      // but the canonical map overrides display to 'Healing Tide Totem'.
      const owner = makeUnit('unit-1', {
        name: 'Feramonk',
        spellCastEvents: [makeSpellCastEvent('108280', 30_000, 'unit-1', 'Feramonk')],
      });
      const result = buildMatchTimeline(
        makeBaseParams({
          owner,
          isHealer: true,
          ownerCDs: [],
          matchStartMs: 0,
          matchEndMs: 60_000,
        }),
      );
      expect(result).toContain('Healing Tide Totem');
    });

    it('still deduplicates against ownerCDs (does not double-emit spells tracked as [OWNER CD])', () => {
      // HTT (spellId 108280) already tracked in ownerCDs at T=30s — no [OWNER CAST] should fire.
      const owner = makeUnit('unit-1', {
        name: 'Feramonk',
        spellCastEvents: [makeSpellCastEvent('108280', 30_000, 'unit-1', 'Feramonk')],
      });
      const httCD: IMajorCooldownInfo = {
        spellId: '108280',
        spellName: 'Healing Tide Totem',
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
          isHealer: true,
          ownerCDs: [httCD],
          matchStartMs: 0,
          matchEndMs: 60_000,
        }),
      );
      // [OWNER CD] should be present; [OWNER CAST] should NOT appear (would be duplicate)
      expect(result).toContain('[OWNER CD]');
      expect(result).not.toContain('[OWNER CAST]');
    });
  });
  ```

- [ ] **Step 2: Run the new tests to confirm they all fail**

  ```bash
  npm run test -- --testPathPattern=timeline.test.ts 2>&1 | tail -40
  ```

  Expected: 6 new failures about target labels.

- [ ] **Step 3: Commit the failing tests**

  ```bash
  git add packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
  git commit -m "test(F65): add failing tests for all-spell emission with target labels"
  ```

---

## Task 3: Implement F65 in `buildMatchTimeline`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Add `resolveTarget` closure alongside `pid()` and `enemyPid()`**

  In `buildMatchTimeline`, locate the two existing helper closures (around line 1172–1183):

  ```ts
  function pid(name: string): string { ... }
  function enemyPid(name: string): string { ... }
  ```

  Add a third closure immediately after `enemyPid`:

  ```ts
  /**
   * Resolves a cast's destUnitName to a display label.
   * Returns "self" for self-casts, a numeric ID for known players, or the raw name.
   * Returns "" when destUnitName is empty (AoE spells with no log target).
   */
  function resolveTarget(destUnitName: string | null | undefined): string {
    if (!destUnitName) return '';
    if (destUnitName === owner.name) return 'self';
    if (playerIdMap) {
      const id = playerIdMap.get(destUnitName);
      if (id !== undefined) return String(id);
    }
    if (enemyIdMap) {
      const id = enemyIdMap.get(destUnitName);
      if (id !== undefined) return String(id);
    }
    return destUnitName;
  }
  ```

- [ ] **Step 2: Replace the F61 whitelist filter in the `[OWNER CAST]` block**

  Locate the existing F61 block (around line 1257–1282). The current code is:

  ```ts
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

  Replace it with:

  ```ts
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
      // Use canonical name from healer map when known; fall back to raw log spell name.
      const displayName = HEALER_CAST_SPELL_ID_TO_NAME[e.spellId] ?? e.spellName;
      if (!displayName) continue;
      const tsMs = e.logLine.timestamp;
      const trackedSet = trackedCastsBySpellId.get(e.spellId);
      if (trackedSet && (trackedSet.has(tsMs) || trackedSet.has(tsMs - 1000) || trackedSet.has(tsMs + 1000))) continue;
      const timeSeconds = (tsMs - matchStartMs) / 1000;
      const targetLabel = resolveTarget(e.destUnitName);
      const targetPart = targetLabel ? ` → ${targetLabel}` : '';
      addEntry(timeSeconds, `${fmtTime(timeSeconds)}  [OWNER CAST]   ${displayName}${targetPart}`);
    }
  }
  ```

- [ ] **Step 3: Run all tests and confirm they pass**

  ```bash
  npm run test -- --testPathPattern=timeline.test.ts 2>&1 | tail -40
  ```

  Expected: All tests pass, including the 6 new F65 tests and the rewritten F61 whitelist test.

- [ ] **Step 4: Run the full test suite to check for regressions**

  ```bash
  npm run test 2>&1 | tail -20
  ```

  Expected: No new failures.

- [ ] **Step 5: Run the linter**

  ```bash
  npm run lint -- --max-warnings=0 2>&1 | tail -20
  ```

  Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit the implementation**

  ```bash
  git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
  git commit -m "feat(F65): emit [OWNER CAST] for all healer spells with target labels"
  ```

---

## Task 4: Update TRACKER.md

- [ ] **Step 1: Mark F65 done in TRACKER.md**

  In `TRACKER.md`, find the F65 row:

  ```md
  | F65 | Backlog | Owner cast log ...
  ```

  Change it to:

  ```md
  | ~~F65~~ | ✅ Done | Owner cast log (all spells, not just major CDs) — `buildMatchTimeline` now emits `[OWNER CAST]` for every `SPELL_CAST_SUCCESS` event the log owner fires when `isHealer=true`. Whitelist removed; all spells emitted. Target resolved to "self", numeric player ID, or raw name via new `resolveTarget()` closure. `HEALER_CAST_SPELL_ID_TO_NAME` retained for canonical display names on known CDs. | `utils.ts` (`buildMatchTimeline`) |
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add TRACKER.md
  git commit -m "chore: mark F65 done in tracker"
  ```

---

## Task 5: Verify with live arena analysis

Run the arena analysis command on a real log to confirm that `[OWNER CAST]` entries now appear for all healer spells (not just the old whitelist) and that target labels look correct.

**Files:** none modified

- [ ] **Step 1: Print the timeline prompt for the most recent match**

  ```bash
  npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 1 --new-prompt --test-prompt --log "$(ls -t ~/Library/Application\ Support/World\ of\ Warcraft/_retail_/Logs/WoWCombatLog*.txt 2>/dev/null | head -1)"
  ```

  If the log path doesn't resolve automatically, find the most recently modified combat log file and pass it explicitly.

- [ ] **Step 2: Analyze the printed timeline inline as Claude Code**

  Read the output. Confirm:
  1. `[OWNER CAST]` entries appear for spells beyond the old whitelist (e.g., `Flash Heal`, `Purge`, `Dispel Magic`, `Renew`, etc. — any healer spell, not just the 18 tracked in `HEALER_CAST_SPELL_ID_TO_NAME`)
  2. Target labels are present (e.g., `→ self`, `→ 2`, `→ 3`) and resolve correctly for self-casts, friendly targets, and enemy targets
  3. Known CDs (Pain Suppression, HTT, PI, etc.) still show the canonical name, not the raw log spell ID
  4. No `[OWNER CAST]` event duplicates an `[OWNER CD]` entry at the same timestamp
  5. The timeline is readable — no obviously malformed lines

- [ ] **Step 3: Provide a 3–5 bullet qualitative assessment**

  Write up what you observed:
  - Which new spell types appeared that weren't visible before
  - Whether target labels added meaningful context (e.g., Psychic Scream showing the enemy ID)
  - Any unexpected entries (empty spell names, broken timestamps, excessive noise)
  - Whether the overall token budget looks acceptable for a typical 2-min 3v3 match

  If any issue is found, fix it before completing this task.

---

## Self-Review

**Spec coverage:**

- ✅ "emit `[OWNER CAST]` for every spell the log owner casts" — whitelist removed, all `SPELL_CAST_SUCCESS` emitted
- ✅ "spell name" — uses canonical name from map or raw log spell name
- ✅ "target" — `resolveTarget()` returns self / numeric ID / raw name
- ✅ "timestamp" — format unchanged (`fmtTime(timeSeconds)`)
- ✅ Self-cast PI + Atonement — both will appear as `[OWNER CAST]` entries
- ✅ Dispels attempted vs. skipped — every Dispel Magic / Detox / Purify appears
- ✅ Healer during CC windows — all casts (not just CDs) visible
- ✅ Psychic Scream target identity — `destUnitName` from the log event, resolved via enemyIdMap when known
- ✅ No double-emit — dedup against ownerCDs preserved

**Placeholder scan:** No placeholders. All code blocks are complete.

**Type consistency:**

- `resolveTarget` takes `string | null | undefined`, returns `string` — safe in template literal
- `displayName` is `string | null` from `e.spellName` fallback; `if (!displayName) continue` guards the null case
- `HEALER_CAST_SPELL_ID_TO_NAME[e.spellId]` returns `string | undefined` — `??` handles undefined

**Known limitation (not in scope for F65):** Psychic Scream and other AoE CCs produce a single SPELL_CAST_SUCCESS log event; `destUnitName` may be empty or reflect only one affected target. F66 tracks affected targets specifically.
