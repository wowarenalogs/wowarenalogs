# Pet Ability Resolution

## Problem

Pet abilities — Water Elemental's Freeze (33395), Felguard's Axe Toss, Felhunter's Spell Lock, Meteor Strike, etc. — live in DB2 `SkillLine` rows whose `DisplayName_lang` starts with `"Pet - "` (e.g. `"Pet - Water Elemental"` = SkillLine 805). They are **not** present in `SpecializationSpells`, class `SkillLineAbility` rows, or talent trees.

This means the first three resolution priorities in `generateSpellClassMap.ts` (SpecializationSpells → class SkillLineAbility → TalentTree) all fail for pet spells. Without a dedicated path, pet CC and interrupts get filtered out of `spellClassMap.json` entirely even though Blizzard correctly flags them with `DiminishType`.

## Mechanism

Implemented as a new resolution priority (`PetSkillLine`) between `TalentTree` and `PvpTalent`. The generator walks the `SkillLine` DB2 table, and for each row whose `DisplayName_lang` starts with `"Pet - "`:

1. Strip the `"Pet - "` prefix and any trailing `" Minor Talent Version"`.
2. Derive candidate summoning-spell names (see rules below).
3. Look each candidate up in `SpellName` via a lowercased name index → `spellId`s.
4. Resolve each candidate `spellId` through the existing class sources (`SpecializationSpells`, class `SkillLineAbility`, `TalentTree`). No pet recursion, no PvP fallback.
5. Union all resolved `specId`s — that set is the owning specs for this pet's SkillLine.
6. Walk `SkillLineAbility` rows whose `SkillLine` matches one of these pet SkillLines (with `AcquireMethod >= 2`), and attribute every listed ability to the owning specs.

### Candidate-name derivation rules

For a pet named `<pet>` (after stripping prefixes/suffixes):

- `Summon <pet>` (e.g. `"Summon Water Elemental"`)
- `Summon <pet>s` (plural — `"Summon Water Elementals"`)
- `<pet>` (bare — matches cases like `"Earth Elemental"` talent node)
- `Raise <pet>` (covers DK-style naming — `"Raise Abomination"`)
- If `<pet>` begins with `Primal `, also try the stripped form and its `Summon <stripped>` / `Summon <stripped>s` variants (covers Shaman elementals where the pet SkillLine prepends `Primal ` but the talent is just `Earth Elemental`).

### Priority placement

`PetSkillLine` is priority 4 — after `TalentTree` (3), before `PvpTalent` (5) and `DescriptionRef` (6). Pets are class abilities by nature, but we want any real class-data source to win first. Sitting above `PvpTalent` ensures a PvP talent that reuses a pet-ability name still gets its PvP attribution merged in via `mergePvpTalentSpecs`.

## Attribution examples (build 12.0.1.66838)

| Pet | Ability | Category | Owning specs |
|---|---|---|---|
| Pet - Water Elemental | Freeze (33395) | DR root | Frost Mage (64) |
| Pet - Felhunter | Spell Lock (19647) | interrupts | all Warlock |
| Pet - Felguard | Axe Toss (89766) | DR stun | Demonology (266) |
| Pet - Infernal | Meteor Strike (171017) | DR stun | Destruction (267) |
| Pet - Primal Earth Elemental | Pulverize (118345) | DR stun | all Shaman |
| Pet - Abomination | Powerful Smash (212337) | DR stun | Unholy (252) |
| Pet - Abomination | Smash (212332) | DR stun | Unholy (252) |

## Known shortfalls (requires curation to fix)

Blizzard sometimes renames the summoning spell away from the pet's SkillLine display name, or uses a wholly unrelated verb. The automated `PetSkillLine` rules cannot catch these:

| Pet SkillLine | Pet ability | Rule would expect | Actual Blizzard name |
|---|---|---|---|
| Pet - Succubus | Seduction (6358, DR disorient) | `Summon Succubus` | `Summon Sayaad` (366222, in Warlock class SkillLine) |
| Pet - Ghoul | Gnaw (91800, DR stun) | `Summon Ghoul` | `Raise Dead` (46585, in all 3 DK talent trees) |

### Ghoul shortfall: auto-resolved via DescriptionRef (priority 6)

As of the description-reference fallback, Ghoul abilities whose durations are mentioned in Raise Dead's tooltip (via `$<spellId>d`) are attributed to Unholy DK without a pet-specific override. Confirmed for Gnaw (91800), Monstrous Blow (91797), and Shambling Rush (91807, interrupt). `PetSkillLine` still misses them, but `DescriptionRef` catches them before they're filtered as unresolved.

### Succubus shortfall: still unresolved

Seduction (6358) has no parent spell whose description references it, so `DescriptionRef` cannot help. The cleanest remedy remains a small curated override — either:

- `PET_SKILLLINE_OVERRIDES: Record<skillLineId, spellName[]>` adding extra candidate names per pet SkillLine, or
- `PET_SKILLLINE_OVERRIDES: Record<skillLineId, specId[]>` hardcoding the owning specs directly.

The first form stays consistent with the existing "resolve through class sources" pipeline. `205 (Pet - Succubus) → ['Summon Sayaad']` would close the gap.

We didn't add the override table here because it re-introduces the curated-maintenance burden we explicitly rejected for general name-based fallback (see `DB2_SPELL_DATA_ISSUES.md`). If future builds add more renamed pets, revisit.

## See also

- `DB2_SPELL_DATA_ISSUES.md` — why name-based fallback is avoided in the general case, and why unresolved player-flagged spells are still reported.
- `generateSpellClassMap.ts` § 6b — implementation.
