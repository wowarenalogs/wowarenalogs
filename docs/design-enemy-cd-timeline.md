# Design: Enemy Offensive CD Timeline (Feature #7)

See [`AI_FEATURES.md`](../AI_FEATURES.md) for the full feature backlog and priority matrix.

---

## Goal

Give Claude context about *when the enemy team was dangerous*, so it can reason about whether
your defensive CDs were timed correctly relative to enemy burst — not just whether you used them.

---

## Data Flow

```
Combat log
    │
    ▼
ICombatUnit[].spellCastEvents  (enemy units, SPELL_CAST_SUCCESS events)
    │
    ▼
reconstructEnemyCDTimeline(enemies, combat)
    │
    ├── filters: Offensive-tagged spells with CD >= 30s (from classMetadata)
    ├── per enemy player: list of { spellName, castTime, availableAgainAt }
    └── detects aligned burst windows: 2+ casts within 10s of each other
    │
    ▼
formatEnemyCDTimelineForContext(timeline, matchDuration)
    │
    ▼
Plain-text block appended to buildMatchContext()
    │
    ▼
Claude prompt → timestamped, cooldown-trading-aware analysis
```

---

## Files

| File | Role |
|------|------|
| `packages/shared/src/utils/enemyCDs.ts` | Core utility — `reconstructEnemyCDTimeline()`, `formatEnemyCDTimelineForContext()` |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx` | Calls utility, appends block to `buildMatchContext()` |
| `scripts/testAnalyze.mjs` | Standalone equivalent for local testing without the web app |

---

## What Claude Sees

```
ENEMY OFFENSIVE COOLDOWN TIMELINE:

  Elemental Shaman (Nistee-Gorgonnash-US):
    Stormkeeper [60s CD]: cast at 1:29 → back at 2:29
    Stormkeeper [60s CD]: cast at 2:51 → back at 3:51
    Stormkeeper [60s CD]: cast at 3:52 → back at 4:52

  Feral Druid (Sarafain-Gorgonnash-US):
    Berserk [180s CD]: cast at 2:25 → not available again before match ended

ENEMY ALIGNED BURST WINDOWS (2+ offensive CDs within 10s of each other):
  1. 2:25: Stormkeeper (Nistee) + Berserk (Sarafain)
```

---

## Key Design Decisions

### 1. Offensive-only filter
Filters on `spell.tags.some(t => String(t) === 'Offensive')` directly against the raw tags
array, not the resolved single-tag field used elsewhere. This correctly captures spells tagged
as both Offensive and Defensive (e.g. DH Metamorphosis), which the single-tag resolution would
misclassify as Defensive.

### 2. "Available again" timestamp
Each cast stores `availableAgainAtSeconds = castTime + cooldownSeconds`. This tells Claude not
just when a CD was used, but when the *next* burst window could arrive — enabling reasoning
like: "their Stormkeeper came back at 2:29, which is exactly when the second damage spike
started."

### 3. Aligned burst windows
A 10-second sliding window: if 2+ enemies cast offensive CDs within 10 seconds of each other,
that's flagged as a coordinated burst window. This is the primary signal for when to pop
defensive CDs. Uncoordinated offensive CDs usually don't create kill windows; overlapping ones
do.

The 10-second threshold is intentionally conservative — it reflects how long it takes burst
damage to ramp after CDs are activated, not the CD activation moment itself.

### 4. No "never used" inference for enemies
Unlike the owner's CD analysis (which shows idle availability windows), we do not attempt to
show enemy CDs that were available but never cast. Reason: we can only observe what appears in
the combat log. A missing cast is indistinguishable from a spell not being in `classMetadata`.
Showing inferred "available but unused" enemy CDs would risk misleading the AI with false data.

---

## What This Enables for Claude

Before this feature Claude could only see *your* CD usage relative to damage spikes. With the
enemy CD timeline, Claude can reason about cooldown trading — the core skill at high arena
rating:

> "Enemy Stormkeeper came back at 2:29. Your Life Cocoon was used at 2:14 — 15 seconds before
> the second Stormkeeper window. Your Druid took 0.67M damage in the 2:45–3:00 window with no
> external cooldown available. Holding Cocoon until 2:29 would have covered both the Stormkeeper
> burst and the subsequent pressure window."

This is the counterfactual, timing-aware analysis that separates this from rule-based tools.

---

## Known Limitations

| Gap | Root Cause | Impact |
|-----|-----------|--------|
| **The Hunt** (DH, `370965`) not tracked | Missing from `classMetadata.ts` | Major DH offensive CD invisible |
| **Dark Ascension** (Shadow Priest, `391109`) not tracked | Missing from `classMetadata.ts` | Shadow Priest has zero tracked offensive CDs |
| **Voidform / Void Eruption** not tracked | Missing from `classMetadata.ts` | Same |
| Only ~18 offensive spells total in `classMetadata` | File hasn't been kept current | Coverage is sparse for post-Shadowlands specs |

**Fix:** Add missing spell IDs to `packages/parser/src/classMetadata.ts` with
`SpellTag.Offensive` and ensure their cooldown entries exist in
`packages/shared/src/data/spellEffects.json`. This is a data maintenance task, not a feature
change — the utility code will pick them up automatically.

---

## Relationship to Other Features

- **Feature #8 (CD Rotation Simulation)** depends on this — the optimal CD rotation simulation
  needs to know *when enemy burst is coming* to model the best defensive sequence. This feature
  provides that ground truth.
- **Feature #2 (CC During Enemy Burst)** uses `extractEnemyBurstWindows()` which is a logical
  extension of this data — checking whether you CC'd into each aligned burst window.
- **Feature #12 (Kill Window Quality)** mirrors this for your *offensive* CDs — the same
  "aligned burst window" logic applied to your team's offensive CDs vs the enemy healer.
