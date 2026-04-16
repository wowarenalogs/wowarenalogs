# DB2 Spell Data Issues

## The Spell ID Mismatch Problem

WoW's DB2 data uses multiple spell IDs for the same player ability. The spell ID that Blizzard's attribute system references (in SpellMisc.Attributes) is often **different** from the spell ID that appears in the talent tree, SpecializationSpells, or SkillLineAbility tables.

### Example: Recklessness (Warrior)

1. DB2 `SpellMisc.Attributes` flags spell ID **389722** with bit 491 ("important").
2. `generateSpellClassMap.ts` picks up 389722 and tries to determine which player specs have access to it.
3. It checks three authoritative sources in order:
   - **Priority 1 — SpecializationSpells**: No entry for 389722.
   - **Priority 2 — SkillLineAbility**: No entry for 389722.
   - **Priority 3 — TalentTree (exact ID)**: No talent node references 389722.
4. All three fail. The spell ID from the attribute system simply doesn't appear in any spec/class assignment table.
5. The talent tree does have a node called "Recklessness" under a **different spell ID** (1719), but we do not use name-based matching because it is too noisy and unreliable.

This is likely a data entry error by Blizzard — the analyst who marked spell attributes flagged the wrong spell ID.

## Why We Do NOT Use Name-Based Fallback

`resolveSpell()` in `generateSpellClassMap.ts` resolves spell IDs to player specs via 3 priority levels (exact ID matching only):

1. **SpecializationSpells** — spec-specific baseline abilities
2. **SkillLineAbility** — class-wide baseline abilities (expanded to all specs of that class)
3. **TalentTree (exact ID)** — talent node references the exact spell ID

A name-based fallback (matching by spell name to talent tree node names) was considered but rejected because:

- It causes NPC and boss spells to be incorrectly attributed to player specs (e.g., Dragon Soul boss "Stomp" matching BM Hunter's "Stomp" talent)
- It matches passive talents that aren't actual castable abilities (e.g., "Mighty Stomp")
- Even for curated lists where every input is a real player spell, the maintenance burden of verifying name matches is not justified
- The underlying problem is Blizzard's data — we should report it, not paper over it

## Unresolved Spells (for Bug Reporting)

When a spell is flagged by DB2 attributes but can't be ID-resolved to a player spec, we check if a talent tree node shares the same name. If so, we write the spell to the `unresolvedSpells` array in `spellClassMap.json` with both the DB2 spell ID and the talent tree spell IDs. This data is **not used by the app** — it exists solely to help file bug reports against Blizzard's DB2 data.

### Unresolved spells from bigDefensive (build 12.0.1.66838)

| DB2 Spell ID | Name | Likely Correct Talent ID |
|---|---|---|
| 50322 | Survival Instincts | 61336 |
| 81549 | Cloak of Shadows | 31224 |
| 115203 | Fortifying Brew | 388917 |
| 120954 | Fortifying Brew | 388917 |
| 199448 | Blessing of Sacrifice | 6940 |
| 207771 | Fiery Brand | 204021 |
| 243435 | Fortifying Brew | 388917 |
| 342246 | Alter Time | 342245 |
| 414658 | Ice Cold | 414659 |

### Unresolved spells from important (build 12.0.1.66838)

| DB2 Spell ID | Name | Likely Correct Talent ID(s) |
|---|---|---|
| 51533 | Feral Spirit | 469314 |
| 106951 | Berserk | 50334, 343223 |
| 110909 | Alter Time | 342245 |
| 115203 | Fortifying Brew | 388917 |
| 152953 | Blinding Light | 115750 |
| 194223 | Celestial Alignment | 395022 |
| 194249 | Voidform | 228260 |
| 199448 | Blessing of Sacrifice | 6940 |
| 231895 | Avenging Wrath | 31884 |
| 243435 | Fortifying Brew | 388917 |
| 335235 | Summon Infernal | 1122 |
| 342246 | Alter Time | 342245 |
| 365362 | Arcane Surge | 365350 |
| 383410 | Celestial Alignment | 395022 |
| 387278 | Summon Darkglare | 205180 |
| 389654 | Master Handler | 424558 |
| 389722 | Recklessness | 1719 |
| 395267 | Invoke Niuzao, the Black Ox | 132578 |
| 414658 | Ice Cold | 414659 |
| 454351 | Avenging Wrath | 31884 |
| 454373 | Avenging Wrath | 31884 |
| 466772 | Doom Winds | 384352 |
| 1219480 | Ascendance | 114050 |
| 1236574 | Tranquility | 740 |
| 1251703 | Takedown | 1250646 |
| 1254294 | Pyroblast | 11366 |
| 1255743 | Total Eclipse | 1240206 |
| 1256008 | Hex | 51514 |
| 1258514 | Blinding Light | 115750 |
| 1270766 | Hex | 51514 |

Note: externalDefensive had 0 unresolved spells in this build — all 9 resolved by exact ID.
