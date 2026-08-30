# F64 + F65 Timeline Data Enhancements

**Date:** 2026-04-19
**Features:** F64 (enemy HP tracking), F65 (owner cast log via data-driven spell cooldowns)
**Files:** `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`, `packages/shared/src/data/spellCooldowns.json` (new), `packages/tools/src/` (new script)

---

## Overview

Two independent timeline data additions that address the top confidence-limiting gaps identified across benchmark match analyses:

- **F64:** Add enemy player HP to `[HP]` ticks at the same frequency as friendly HP. Currently Claude cannot evaluate kill-window timing or whether offensive CDs were genuine kill attempts because enemy HP is absent.
- **F65:** Emit `[OWNER CAST]` for every owner spell with base cooldown ≥30s not already tracked in `ownerCDs`. Currently only a small hardcoded healer whitelist is covered. F65 replaces this with a data-driven lookup generated from Wago.tools DBC data, covering all specs automatically.

---

## F64 — Enemy HP in Timeline

### Parameter Change

Add `enemies` to `BuildMatchTimelineParams` in `utils.ts`:

```ts
enemies?: ICombatUnit[];
```

`enemies` is already available at the call site in `index.tsx` (line ~215). Pass it through directly — one line change at the call site.

### HP Tick Loop Changes

**Critical windows:** Add enemy deaths as 1s-resolution windows alongside existing friendly-death windows:

```ts
for (const d of enemyDeaths) {
  for (let t = Math.max(0, Math.ceil(d.atSeconds - 10)); t <= Math.floor(d.atSeconds); t++) {
    criticalWindowSet.add(t);
  }
}
```

**Tick emission:** Extend `hpFriends` to include enemy units:

```ts
const hpUnits = [...friends, ...(enemies ?? [])];
```

Enemy names are compressed via the existing `enemyPid()` helper. Output format is unchanged — enemy entries appear inline on the same `[HP]` line as friendlies:

```
0:15  [HP]   1:84% / 2:91% / 3:62% / 4:73% / 5:55% / 6:88%
```

(IDs 1–3 friendly, 4–6 enemy per PLAYER LOADOUT numbering)

**Coverage caveat:** `getUnitHpAtTimestamp` reads from `advancedActions` — the actor's HP at their last logged action. If an enemy is silent for a window (stunned, not casting), the reading may be stale or absent. Absent readings silently omit that unit from the tick — same behavior as friendly units with sparse data.

### Token Impact

Approximately doubles the HP section. A 3-minute match with 3 friendly + 3 enemy players and ~60 HP ticks adds ~180 additional short strings (`4:73%`-style). Estimated overhead: ~150–200 tokens per match.

---

## F65 — Owner Cast Log (Data-Driven)

### New Data File: `spellCooldowns.json`

Location: `packages/shared/src/data/spellCooldowns.json`

Schema:

```json
{
  "12345": { "name": "Psychic Scream", "baseCooldownSeconds": 45 },
  ...
}
```

Covers all player-castable spells with base cooldown ≥30s. Generated from Wago.tools DBC spell data (same source as existing `spellEffects.json`, `spellIdLists.json`, `talentIdMap.json`).

### New Tool Script

Location: `packages/tools/src/generateSpellCooldowns.ts`

Responsibilities:

1. Fetch Wago.tools DBC spell export (spell base cooldown field)
2. Filter to player-castable spells with `baseCooldownSeconds >= 30` (exclude NPC-only spells; cross-reference against Wago.tools DBC `spellType` / `schoolMask` flags or known Arena player spell ID ranges)
3. Exclude spells already tracked as major CDs by `extractMajorCooldowns` (cross-reference `spellIdListsData`) — optional; the runtime dedup handles this anyway
4. Write `packages/shared/src/data/spellCooldowns.json`

Runs as part of the `update-wow-data` workflow. Output is committed to the repo and versioned with the patch data.

### Timeline Change

Replace the existing `HEALER_CAST_SPELL_ID_TO_NAME` whitelist with a lookup against `spellCooldowns.json`. Remove the `isHealer` gate:

```ts
import spellCooldowns from '../../../data/spellCooldowns.json';

// In buildMatchTimeline, replacing the existing [OWNER CAST] block:
for (const e of owner.spellCastEvents ?? []) {
  if (e.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
  if (!e.spellId) continue;
  const spellMeta = (spellCooldowns as Record<string, { name: string; baseCooldownSeconds: number }>)[e.spellId];
  if (!spellMeta) continue;
  const tsMs = e.logLine.timestamp;
  // Dedup: skip if already tracked in ownerCDs within ±1s
  const trackedSet = trackedCastsBySpellId.get(e.spellId);
  if (trackedSet && (trackedSet.has(tsMs) || trackedSet.has(tsMs - 1000) || trackedSet.has(tsMs + 1000))) continue;
  const timeSeconds = (tsMs - matchStartMs) / 1000;
  const target = e.destUnitName && e.destUnitName !== 'nil' ? ` → ${e.destUnitName}` : '';
  addEntry(timeSeconds, `${fmtTime(timeSeconds)}  [OWNER CAST]   ${spellMeta.name}${target}`);
}
```

The `trackedCastsBySpellId` dedup map (already built for F61) is reused unchanged.

### What This Resolves

- PI+Atonement pairing: PI appears in `ownerCDs`; other Atonement-application casts (Penance, Shadow Mend ≥30s entries) appear as `[OWNER CAST]` if they have ≥30s CD
- Dispel tracking: Mass Dispel (45s) and Purify (8s — below threshold, stays excluded) appear correctly
- CC window activity: Psychic Scream (45s) appears with target name
- Non-healer specs: major utility spells with ≥30s CD that aren't already in `extractMajorCooldowns`' tracked list appear automatically without manual curation

### Token Impact

Depends on how many ≥30s CD spells the owner has beyond what's in `ownerCDs`. For a Disc Priest, expect 3–8 additional `[OWNER CAST]` entries per match (e.g., Psychic Scream, Mass Dispel, Holy Word: Serenity if applicable). Estimated overhead: ~50–100 tokens per match.

---

## Implementation Order

1. **F64 first** — pure `utils.ts` change, no data dependency. Low risk.
2. **F65 data pipeline** — new tool script + generate `spellCooldowns.json`.
3. **F65 timeline** — replace whitelist with lookup, remove `isHealer` gate.

F64 and F65 are independent — either can be implemented alone.

---

## Testing

- **F64:** Extend `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` — assert that `[HP]` lines include enemy player IDs when `enemies` is passed, and that enemy deaths add 1s-resolution critical windows.
- **F65 data:** Validate `spellCooldowns.json` is non-empty, all entries have `baseCooldownSeconds >= 30`, no NPC-only spell IDs included (spot-check known IDs).
- **F65 timeline:** Assert that owner casts for known ≥30s CD spell IDs appear as `[OWNER CAST]`, and that spells already in `ownerCDs` are not double-emitted.
