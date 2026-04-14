# Spell Class Map: Remaining TODOs

## Blur (212800) — RESOLVED

Blur had two spell IDs: **198589** (the castable ability on the action bar) and **212800** (the buff/aura it applies). The `bigDefensive` bit flag in SpellMisc is on 212800 (the buff), while 198589 is in `SpecializationSpells` mapping to Havoc (577) and Devourer (1480) and has the `important` bit flag.

**Fix applied:** Added a "cross-category name resolution" step to `generateSpellClassMap.ts`. After resolving all categories, any unresolved spell checks if a spell with the same name was already resolved in another category and inherits its specIds. This resolved Blur (212800) via 198589's mapping, plus 6 additional `important` spells with the same cast→buff ID pattern.

## Adaptation (PvP Talent, spell 195756) not tracked

`spellTags.ts:38` has a TODO: `// TODO: Add adaptation spell id here`. Adaptation is a PvP talent that auto-breaks CC lasting 5+ seconds, triggering the medallion effect at half cooldown. The trinket waste detector in `analyzeMistakes.ts` only checks for manual `SPELL_CAST_SUCCESS` of `336126` (Gladiator's Medallion). Adaptation procs may appear differently in the combat log — needs investigation.

## Integration with Mistakes tab

The new `spellClassMap.json` is generated but not yet consumed by the Mistakes tab. The next step is to:

1. Replace the hardcoded `DEFENSIVE_CDS` in `mistakeKnowledgeBase.ts` with a lookup from `spellClassMap.json`, keyed by `player.spec`
2. Remove the hardcoded `OFFENSIVE_CDS` (currently dead code) — the `important` category in `spellClassMap.json` can serve this role
3. Import `TRINKET_SPELL_ID` from `spellTags.ts` instead of redeclaring it
4. Consider deriving `FULL_IMMUNITY_AURA_IDS` from `spells.json` (type: "immunities")
5. Extract `DR_CATEGORIES` to a shared data file since it's genuinely novel data

## Unresolved `important` spells are mostly non-player

~190 of 277 `importantSpellIds` are unresolved. Many of these are dungeon/raid mob abilities (Mecha-Armor variants, Dread Screech, Felstorm, etc.) that correctly have no class/spec association. The `important` bit flag in SpellMisc is used for replay tracking UI and includes NPC spells. This is expected and not a bug.

## talentIdMap.json may be stale

The talent data comes from Raidbots (`scripts/update_statics.js`), which may not yet reflect the latest Midnight talent changes. If spells are unexpectedly unresolved, try running `node scripts/update_statics.js` first and then re-running the class map generator.

## Dead code in the PR

Still present from the original PR and should be cleaned up:
- `MistakeRule` type and `getMistakeRulesForSpec()` in `mistakeKnowledgeBase.ts` — exported but never consumed
- `OFFENSIVE_CDS` — declared but never referenced in `analyzeMistakes.ts`
- `IMMUNITY_SPELL_IDS` (the broader set) — declared but never used, only `FULL_IMMUNITY_AURA_IDS` is used
