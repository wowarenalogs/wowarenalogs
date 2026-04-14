# PR Review Notes: Mistakes Tab v2

## Spell ID Data Overlap with Existing Metadata

`mistakeKnowledgeBase.ts` hardcodes ~150+ spell IDs that significantly overlap with existing data sources in the repo.

### Overlaps

| PR Data | Existing Source | Overlap |
|---|---|---|
| `DEFENSIVE_CDS` (30 spell IDs) | `spellIdLists.json` → `bigDefensiveSpellIds` | 14 of 30 already in big defensives list |
| `DEFENSIVE_CDS` | `classMetadata.ts` → `SpellTag.Defensive` | Nearly all already tagged as `Defensive` per-class |
| `OFFENSIVE_CDS` | `classMetadata.ts` → `SpellTag.Offensive` | Already tagged per-class |
| `IMMUNITY_SPELL_IDS` / `FULL_IMMUNITY_AURA_IDS` | `spells.json` → `type: "immunities"` | All 3 (642, 45438, 186265) already classified |
| `TRINKET_SPELL_ID` (`336126`) | `spellTags.ts` → `trinketSpellIds` | Exact duplicate (line 38) |
| `LOW_VALUE_CC_SPELL_IDS` | `spells.json` → `type: "cc"` + `ccSpellIds` | All already tagged as CC |

### What's NOT duplicated (novel data)

- **`DR_CATEGORIES`** (stun/incapacitate/disorient) — New metadata, doesn't exist elsewhere in the repo.
- **Per-spec mapping in `DEFENSIVE_CDS`** — Existing data in `classMetadata.ts` is per-class (not per-spec). The PR adds spec-level granularity (e.g., Arms vs Fury Warrior) that `classMetadata.ts` doesn't provide since it uses `CombatUnitClass` not `CombatUnitSpec`.
- **"Low-value CC" concept** — Sap/Gouge/Garrote Silence are tagged as CC elsewhere, but the judgment that they're "low-value for trinketing" is new domain logic.

### Recommendations

1. **Immunity spells**: Derive from `spells.json` where `type === "immunities"` rather than hardcoding. The `FULL_IMMUNITY_AURA_IDS` subset is a reasonable hardcoded subset though, since not all immunities are full damage immunities (e.g., Cloak of Shadows is magic-only).
2. **Trinket spell ID**: Import from `spellTags.ts` → `trinketSpellIds[0]` instead of redeclaring `'336126'`.
3. **Defensive CDs**: `classMetadata.ts` already has per-class `SpellTag.Defensive` tags. Consider querying that data and filtering by spec instead of maintaining a parallel list. Gap: `classMetadata` is per-class not per-spec, so bridge logic would be needed — but it would stay in sync automatically.
4. **Offensive CDs**: Same as defensives — `classMetadata.ts` has `SpellTag.Offensive` per-class.
5. **DR_CATEGORIES**: Genuinely new. Consider extracting to a shared data file (alongside `spells.json` or in `spellTags.ts`) since DR categorization could be useful for other features like the CC tab.
6. **`IMMUNITY_SPELL_IDS`** (broader set including Cloak, Bladestorm, Netherwalk): Mixes full/partial immunities and is **never actually used** — only `FULL_IMMUNITY_AURA_IDS` is used in the analysis code. Dead code.

### Trinket Spell ID Coverage (Midnight / Season 1 "Galactic")

The codebase only tracks a single trinket spell ID: `336126` (Gladiator's Medallion). This is the CC-break on-use effect and is **consistent across all seasons** — the Galactic Gladiator's Medallion uses the same spell ID 336126 as every previous season's medallion.

However, the Galactic season has a full set of PvP trinkets, and the `spellTags.ts` TODO (`// TODO: Add adaptation spell id here`) is still unresolved. Here are the current-season PvP trinket spells:

| Trinket | Spell ID | Effect | CC-Break? |
|---|---|---|---|
| Galactic Gladiator's Medallion | `336126` | Removes all CC/movement impairment (2 min CD) | **Yes** — tracked |
| Galactic Gladiator's Emblem | `345231` | Increases max health for 15 sec (1.5 min CD) | No |
| Galactic Gladiator's Badge of Ferocity | `345228` | Increases primary stat for 15 sec (1 min CD) | No |
| Galactic Gladiator's Insignia of Alacrity | `345229` | Proc: chance to grant primary stat for 20 sec | No |
| Adaptation (PvP Talent) | `195756` | Auto-breaks CC >= 5 sec, half medallion CD | **Yes — NOT tracked** |

**Key finding:** `336126` is the only trinket with a CC-break, so it's sufficient for the `detectTrinketLowValueCC` mistake detector. The Emblem, Badge, and Insignia are stat trinkets with no CC-break.

**However, Adaptation (spell ID `195756`)** is a PvP talent that auto-triggers the medallion effect on CC lasting 5+ seconds. If a player is running Adaptation, they won't have a `SPELL_CAST_SUCCESS` for `336126` when it auto-procs — the detection logic in `analyzeMistakes.ts` (line 190-191) only checks for manual casts of `336126`. This could cause false negatives (missed trinket-waste detections) or false positives (flagging a "wasted" manual trinket when Adaptation would have handled it). Worth investigating how Adaptation procs appear in the combat log.

The `spellTags.ts` TODO about Adaptation should also be resolved — either add `195756` or document why it's excluded.

### Dead / Unwired Code

- `MistakeRule` type and `getMistakeRulesForSpec()` are exported but **never consumed** — the analyzer uses inline logic instead. Looks like an earlier design that was abandoned.
- `OFFENSIVE_CDS` is declared and populated but **never referenced** in `analyzeMistakes.ts`. The `offensive_cd_into_immunity` detection type is defined but not implemented.
