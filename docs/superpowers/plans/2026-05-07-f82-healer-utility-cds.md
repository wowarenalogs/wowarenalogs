# F82: Healer Utility CDs in [OWNER CD] — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Guardian Spirit (Priest Holy), Divine Hymn (Priest Holy), and Tranquility (Druid Restoration) appear as `[OWNER CD]` timeline events and in PLAYER LOADOUT by adding the missing `SpellTag.Defensive` tags in classMetadata, restricting them to the correct spec via SPEC_EXCLUSIVE_SPELLS, and adding missing cooldown data for Tranquility.

**Architecture:** The root cause is confirmed: all three spells have `tags: []` in `classMetadata.ts`, causing `extractMajorCooldowns` to skip them at the `if (spell.tags.length === 0) return false` check. Guardian Spirit (47788) and Divine Hymn (64843) already have cooldown data in `spellEffects.json`. Tranquility (740) is missing from `spellEffects.json` and needs a manual entry. We also add all three to `SPEC_EXCLUSIVE_SPELLS` so they don't bleed to other specs of the same class.

**Tech Stack:** TypeScript, Jest

---

## File Map

| File                                                    | Change                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/parser/src/classMetadata.ts`                  | Add `SpellTag.Defensive` to Guardian Spirit (47788), Divine Hymn (64843), Tranquility (740) |
| `packages/shared/src/utils/cooldowns.ts`                | Add 47788, 64843 (Priest_Holy) and 740 (Druid_Restoration) to SPEC_EXCLUSIVE_SPELLS         |
| `packages/shared/src/data/spellEffects.json`            | Add entry for Tranquility (740) with cooldownSeconds: 180                                   |
| `packages/shared/src/utils/__tests__/cooldowns.test.ts` | Add tests verifying the three spells are tracked                                            |

---

### Task 1: Add `SpellTag.Defensive` to the three healer utility CDs in classMetadata.ts

**Files:**

- Modify: `packages/parser/src/classMetadata.ts`

**Step 1: Read the file at the Priest and Druid sections**

Open `packages/parser/src/classMetadata.ts`. Find these three lines (use their exact line context to avoid matching wrong entries):

For Priest (around line 7392–7394):

```typescript
    { spellId: '47788', name: 'Guardian Spirit', tags: [] },
    { spellId: '64843', name: 'Divine Hymn', tags: [] },
    { spellId: '64901', name: 'Symbol of Hope', tags: [] },
```

For Druid (around line 15870):

```typescript
    { spellId: '740', name: 'Tranquility', tags: [] },
```

**Step 2: Change the tags for Guardian Spirit**

Change:

```typescript
    { spellId: '47788', name: 'Guardian Spirit', tags: [] },
```

To:

```typescript
    { spellId: '47788', name: 'Guardian Spirit', tags: [SpellTag.Defensive] },
```

**Step 3: Change the tags for Divine Hymn**

Change:

```typescript
    { spellId: '64843', name: 'Divine Hymn', tags: [] },
```

To:

```typescript
    { spellId: '64843', name: 'Divine Hymn', tags: [SpellTag.Defensive] },
```

**Step 4: Change the tags for Tranquility**

Change:

```typescript
    { spellId: '740', name: 'Tranquility', tags: [] },
```

To:

```typescript
    { spellId: '740', name: 'Tranquility', tags: [SpellTag.Defensive] },
```

**Step 5: Run lint**

```bash
npm run lint -w @wowarenalogs/parser 2>&1 | tail -5
```

Expected: exit 0.

**Step 6: Commit**

```bash
git add packages/parser/src/classMetadata.ts
git commit -m "feat(classMetadata): tag Guardian Spirit, Divine Hymn, Tranquility as Defensive (F82)"
```

---

### Task 2: Add SPEC_EXCLUSIVE_SPELLS entries and Tranquility cooldown data

**Files:**

- Modify: `packages/shared/src/utils/cooldowns.ts` (SPEC_EXCLUSIVE_SPELLS)
- Modify: `packages/shared/src/data/spellEffects.json`

**Step 1: Read cooldowns.ts SPEC_EXCLUSIVE_SPELLS section**

Open `packages/shared/src/utils/cooldowns.ts` and find the `SPEC_EXCLUSIVE_SPELLS` constant (around line 34). Find the `// Priest` section (around line 65–76):

```typescript
  // Priest
  '33206': [CombatUnitSpec.Priest_Discipline], // Pain Suppression
  '47536': [CombatUnitSpec.Priest_Discipline], // Rapture
  '62618': [CombatUnitSpec.Priest_Discipline], // Power Word: Barrier
  '81782': [CombatUnitSpec.Priest_Discipline], // Power Word: Barrier
  '197871': [CombatUnitSpec.Priest_Discipline], // Dark Archangel
  '19236': [CombatUnitSpec.Priest_Holy], // Desperate Prayer
  '196762': [CombatUnitSpec.Priest_Holy], // Inner Focus
  '200183': [CombatUnitSpec.Priest_Holy], // Apotheosis
  '47585': [CombatUnitSpec.Priest_Shadow], // Dispersion
  '64044': [CombatUnitSpec.Priest_Shadow], // Psychic Horror
```

**Step 2: Add Guardian Spirit and Divine Hymn to SPEC_EXCLUSIVE_SPELLS**

Insert two lines after `'200183': [CombatUnitSpec.Priest_Holy], // Apotheosis`:

```typescript
  '19236': [CombatUnitSpec.Priest_Holy], // Desperate Prayer
  '196762': [CombatUnitSpec.Priest_Holy], // Inner Focus
  '200183': [CombatUnitSpec.Priest_Holy], // Apotheosis
  '47788': [CombatUnitSpec.Priest_Holy], // Guardian Spirit
  '64843': [CombatUnitSpec.Priest_Holy], // Divine Hymn
  '47585': [CombatUnitSpec.Priest_Shadow], // Dispersion
  '64044': [CombatUnitSpec.Priest_Shadow], // Psychic Horror
```

**Step 3: Find the Druid section in SPEC_EXCLUSIVE_SPELLS**

Find the `// Druid` comment area (around line 36–46):

```typescript
  // Druid
  '102560': [CombatUnitSpec.Druid_Balance], // Incarnation: Chosen of Elune
  '194223': [CombatUnitSpec.Druid_Balance], // Celestial Alignment
  '102543': [CombatUnitSpec.Druid_Feral], // Incarnation: King of the Jungle
  '106839': [CombatUnitSpec.Druid_Feral], // Skull Bash
  '106951': [CombatUnitSpec.Druid_Feral], // Berserk
  '102558': [CombatUnitSpec.Druid_Guardian], // Incarnation: Guardian of Ursoc
  '18562': [CombatUnitSpec.Druid_Restoration], // Swiftmend
  '33891': [CombatUnitSpec.Druid_Restoration], // Incarnation: Tree of Life
  '102342': [CombatUnitSpec.Druid_Restoration], // Ironbark
  '236696': [CombatUnitSpec.Druid_Restoration], // Thorns
```

**Step 4: Add Tranquility to the Druid Restoration section**

Insert after `'236696': [CombatUnitSpec.Druid_Restoration], // Thorns`:

```typescript
  '18562': [CombatUnitSpec.Druid_Restoration], // Swiftmend
  '33891': [CombatUnitSpec.Druid_Restoration], // Incarnation: Tree of Life
  '102342': [CombatUnitSpec.Druid_Restoration], // Ironbark
  '236696': [CombatUnitSpec.Druid_Restoration], // Thorns
  '740': [CombatUnitSpec.Druid_Restoration], // Tranquility
```

**Step 5: Add Tranquility to spellEffects.json**

Open `packages/shared/src/data/spellEffects.json`. Find the entry for `"31821"` (Aura Mastery, which has the same 180s cooldown pattern):

```json
  "31821": {
    "spellId": "31821",
    "name": "Aura Mastery",
    "cooldownSeconds": 180,
    "durationSeconds": 8,
    "dispelType": null
  },
```

Add the Tranquility entry in numeric spell ID order (740 is very early in the file). Find the appropriate location near the start of the JSON file and insert:

```json
  "740": {
    "spellId": "740",
    "name": "Tranquility",
    "cooldownSeconds": 180,
    "durationSeconds": 5,
    "dispelType": null
  },
```

**Step 6: Run lint**

```bash
npm run lint -w @wowarenalogs/shared 2>&1 | tail -5
```

Expected: exit 0.

**Step 7: Commit**

```bash
git add packages/shared/src/utils/cooldowns.ts packages/shared/src/data/spellEffects.json
git commit -m "feat(cooldowns): add Guardian Spirit, Divine Hymn, Tranquility to major CD tracking (F82)"
```

---

### Task 3: Add tests

**Files:**

- Modify: `packages/shared/src/utils/__tests__/cooldowns.test.ts`

The test structure uses `makeUnit` and `makeSpellCastEvent` from `testHelpers`. Look at the existing tests in the `describe('extractMajorCooldowns', ...)` block (around line 794) to understand the pattern.

The `makeCombatFull` helper inside the describe block is:

```typescript
function makeCombatFull(units: Record<string, ReturnType<typeof makeUnit>>) {
  return {
    startTime: T0,
    endTime: T_END,
    units,
  } as unknown as import('@wowarenalogs/parser').AtomicArenaCombat;
}
```

**Step 1: Add tests at the end of the `describe('extractMajorCooldowns', ...)` block**

Add the following tests before the final `});` of that describe block:

```typescript
it('includes Guardian Spirit (47788) for Priest Holy who cast it', () => {
  const owner = makeUnit('player-1', {
    class: CombatUnitClass.Priest,
    spec: CombatUnitSpec.Priest_Holy,
    spellCastEvents: [makeSpellCastEvent('47788', T0 + 30_000, 'friendly-1')],
  });
  const combat = makeCombatFull({ 'player-1': owner });
  const cds = extractMajorCooldowns(owner, combat);
  const gs = cds.find((c) => c.spellId === '47788');
  expect(gs).toBeDefined();
  expect(gs?.spellName).toBe('Guardian Spirit');
  expect(gs?.cooldownSeconds).toBe(180);
});

it('does NOT include Guardian Spirit for Priest Discipline (SPEC_EXCLUSIVE guard)', () => {
  const owner = makeUnit('player-1', {
    class: CombatUnitClass.Priest,
    spec: CombatUnitSpec.Priest_Discipline,
    spellCastEvents: [makeSpellCastEvent('47788', T0 + 30_000, 'friendly-1')],
  });
  const combat = makeCombatFull({ 'player-1': owner });
  const cds = extractMajorCooldowns(owner, combat);
  expect(cds.find((c) => c.spellId === '47788')).toBeUndefined();
});

it('includes Divine Hymn (64843) for Priest Holy who cast it', () => {
  const owner = makeUnit('player-1', {
    class: CombatUnitClass.Priest,
    spec: CombatUnitSpec.Priest_Holy,
    spellCastEvents: [makeSpellCastEvent('64843', T0 + 45_000, 'player-1')],
  });
  const combat = makeCombatFull({ 'player-1': owner });
  const cds = extractMajorCooldowns(owner, combat);
  const dh = cds.find((c) => c.spellId === '64843');
  expect(dh).toBeDefined();
  expect(dh?.spellName).toBe('Divine Hymn');
  expect(dh?.cooldownSeconds).toBe(180);
});

it('does NOT include Divine Hymn for Priest Discipline (SPEC_EXCLUSIVE guard)', () => {
  const owner = makeUnit('player-1', {
    class: CombatUnitClass.Priest,
    spec: CombatUnitSpec.Priest_Discipline,
    spellCastEvents: [makeSpellCastEvent('64843', T0 + 45_000, 'player-1')],
  });
  const combat = makeCombatFull({ 'player-1': owner });
  const cds = extractMajorCooldowns(owner, combat);
  expect(cds.find((c) => c.spellId === '64843')).toBeUndefined();
});

it('includes Tranquility (740) for Druid Restoration who cast it', () => {
  const owner = makeUnit('player-1', {
    class: CombatUnitClass.Druid,
    spec: CombatUnitSpec.Druid_Restoration,
    spellCastEvents: [makeSpellCastEvent('740', T0 + 60_000, 'player-1')],
  });
  const combat = makeCombatFull({ 'player-1': owner });
  const cds = extractMajorCooldowns(owner, combat);
  const tranq = cds.find((c) => c.spellId === '740');
  expect(tranq).toBeDefined();
  expect(tranq?.spellName).toBe('Tranquility');
  expect(tranq?.cooldownSeconds).toBe(180);
});

it('does NOT include Tranquility for Druid Balance (SPEC_EXCLUSIVE guard)', () => {
  const owner = makeUnit('player-1', {
    class: CombatUnitClass.Druid,
    spec: CombatUnitSpec.Druid_Balance,
    spellCastEvents: [makeSpellCastEvent('740', T0 + 60_000, 'player-1')],
  });
  const combat = makeCombatFull({ 'player-1': owner });
  const cds = extractMajorCooldowns(owner, combat);
  expect(cds.find((c) => c.spellId === '740')).toBeUndefined();
});
```

**Step 2: Run the tests to make sure they fail (Tasks 1 and 2 must be done first)**

Tasks 1 and 2 must be complete before running the tests. If they are complete, run:

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern cooldowns 2>&1 | tail -20
```

Expected: all tests pass.

**Step 3: Commit**

```bash
git add packages/shared/src/utils/__tests__/cooldowns.test.ts
git commit -m "test(cooldowns): add extractMajorCooldowns tests for Guardian Spirit, Divine Hymn, Tranquility (F82)"
```

---

### Task 4: Mark F82 done in TRACKER

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1: Find and update the F82 row**

In `TRACKER.md`, find the row:

```
| F82 | Backlog | ...
```

Change `Backlog` to `✅ Done`.

- [ ] **Step 2: Commit**

```bash
git add TRACKER.md
git commit -m "chore: mark F82 done in TRACKER"
```
