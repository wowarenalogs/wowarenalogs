# Data Source Audit

Quality and reliability of the data each feature depends on. Updated as gaps are found or fixed.

---

## Log Data Tiers

| Tier                 | What it requires                                          | Reliability                                                             |
| -------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Basic events**     | Standard WoW combat log                                   | Always present                                                          |
| **COMBATANT_INFO**   | Player loaded before arena started                        | Usually present; missing if player joined late or log started mid-match |
| **Advanced logging** | "Advanced Combat Logging" enabled in WoW Network settings | Player-dependent — many players don't enable this                       |

---

## Feature-by-Feature Audit

### Cooldown Usage Analysis (`cooldowns.ts`)

| Data used                                              | Tier           | Reliability | Notes                                                                          |
| ------------------------------------------------------ | -------------- | ----------- | ------------------------------------------------------------------------------ |
| `unit.spellCastEvents` (SPELL_CAST_SUCCESS)            | Basic          | ✅ Always   | Core data — reliable                                                           |
| `unit.info.talents`                                    | COMBATANT_INFO | ⚠️ Usually  | Missing → falls back to cast evidence to infer talents                         |
| `unit.info.pvpTalents`                                 | COMBATANT_INFO | ⚠️ Usually  | Missing → PvP talent spells only included if actually cast                     |
| `spellEffectData[spellId].cooldownSeconds`             | Static         | ✅ Always   | Can be stale if Blizzard changes CD in a patch                                 |
| `classMetadata` spell tags                             | Static         | ✅ Always   | Can miss new spells or tag changes between patches                             |
| `unit.advancedActions` (max HP for pressure threshold) | Advanced       | ⚠️ Optional | Falls back to flat 250k if missing — panic/pressure detection is less accurate |

**Known gaps:**

- **CDR blindness** — CD availability is purely `castTime + cooldownSeconds`. Shifting Power, Wake of Ashes, Convoke resets, etc. are ignored → idle window calculations wrong for affected specs. Tracked as F16.
- **Pre-log casts invisible** — if a CD was used before the log started, the system treats the first in-log cast as if it was the first use ever, potentially underreporting idle time.
- **Charge-based CDs** — spells with 2 charges use `chargeCooldownSeconds`, but multi-charge math (second charge becoming available before full CD) is not modeled.
- **Pet/Totem/Guardian Tracking Missing** — `unit.spellCastEvents` does not automatically bucket pet casts (e.g., Warlock Felhunter Spell Lock, Shaman Grounding Totem). These major cooldowns will be completely invisible unless pet GUIDs are explicitly mapped to the owner.
- **Interrupt Success Unverified** — `SPELL_CAST_SUCCESS` only tracks that an interrupt was *pressed*, but completely ignores `SPELL_INTERRUPT` events. We don't trace if the kick actually stopped a cast.

---

### Enemy CD Timeline (`enemyCDs.ts`)

| Data used                                            | Tier   | Reliability | Notes                                        |
| ---------------------------------------------------- | ------ | ----------- | -------------------------------------------- |
| `enemy.spellCastEvents` (SPELL_CAST_SUCCESS)         | Basic  | ✅ Always   | Enemy casts are always logged                |
| `spellEffectData[spellId].cooldownSeconds`           | Static | ✅ Always   | Same staleness risk as above                 |
| `unit.auraEvents` (healer CC check in burst windows) | Basic  | ✅ Usually  | Auras applied before log start may be missed |
| `unit.damageIn` (damage ratio for danger scoring)    | Basic  | ✅ Always   | Reliable                                     |

**Known gaps:**

- **Enemy CDR invisible** — same CDR issue as friendly CDs.
- **Pre-log enemy CDs invisible** — an enemy who used Combustion 10 seconds before the log started looks like they have a fresh CD available at 0:00.
- **Buff duration not tracked** — we know when the CD was _cast_, not when the buff _expired_. E.g. a 10-second Combustion buff is treated as a point event, not a window. The `toSeconds` on aligned burst windows is just the last cast time, not actual buff end.
- **Aligned burst window danger score** uses static `spellDangerWeight` — weights may be outdated post-patch.

---

### Dampening Curve (`dampening.ts`)

| Data used                                                     | Tier  | Reliability | Notes                                               |
| ------------------------------------------------------------- | ----- | ----------- | --------------------------------------------------- |
| `unit.auraEvents` (spellId `110310`, SPELL_AURA_APPLIED_DOSE) | Basic | ⚠️ Usually  | Primary source. Warns explicitly when absent.       |
| Formula fallback (bracket + match duration)                   | None  | ✅ Always   | Used when aura events missing. Reasonable accuracy. |

**Known gaps:**

- If the arena started with pre-existing dampening stacks (rejoining mid-match), initial stack count from before log start is missed — formula fallback then overrides correctly.
- **Assessment: Best-handled feature in the codebase.** Has explicit fallback + warning. Low risk.

---

### Panic Trading & Overlap Detection (`cooldowns.ts`)

| Data used                                                          | Tier     | Reliability | Notes                                         |
| ------------------------------------------------------------------ | -------- | ----------- | --------------------------------------------- |
| `unit.spellCastEvents` (SPELL_CAST_SUCCESS)                        | Basic    | ✅ Always   |                                               |
| `unit.auraEvents` (offensive spell aura tracking for threat check) | Basic    | ✅ Usually  |                                               |
| `unit.advancedActions` (max HP → pressure threshold)               | Advanced | ⚠️ Optional | Falls back to flat 250k per player if missing |
| `unit.damageIn` (pre/post-cast damage for panic detection)         | Basic    | ✅ Always   |                                               |

**Known gaps:**

- **Flat HP fallback** — without advanced logging, all players use 250k as "significant damage" regardless of spec/role. A tank taking 250k is irrelevant; a healer at 250k might be critical. This produces false negatives (missed panics) and false positives (non-events flagged).
- **Offensive threat uses aura events** — if an offensive buff was applied before log start it won't be detected, potentially misclassifying a legitimate reactive defensive as a panic press.

---

### Dispel Analysis (`dispelAnalysis.ts`)

| Data used                                                        | Tier           | Reliability | Notes                                                                     |
| ---------------------------------------------------------------- | -------------- | ----------- | ------------------------------------------------------------------------- |
| `unit.auraEvents` (SPELL_AURA_APPLIED / REMOVED / BROKEN)        | Basic          | ✅ Usually  |                                                                           |
| `unit.actionOut` (SPELL_DISPEL and SPELL_STOLEN)                 | Basic          | ✅ Always   | Dispel and spellsteal events are reliably logged                          |
| `spellEffectData[spellId].dispelType`                            | Static         | ⚠️ Partial  | Known incomplete — some spells have wrong or missing dispelType in the DB |
| `unit.info.talents` (DH Consume Magic, Warlock Felhunter gating) | COMBATANT_INFO | ⚠️ Usually  | Falls back to cast evidence                                               |
| `unit.damageIn` (post-CC pressure measurement)                   | Basic          | ✅ Always   |                                                                           |

**Known gaps:**

- **PURGE_BLOCKLIST is incomplete** — Divine Shield (bubble) and other self-cast immunities are tagged Magic in the DB but cannot be purged. Tracked as B7.
- **`dispelType` in spellEffectData is wrong for some spells** — DISPEL_TYPE_FALLBACK covers known cases but is intentionally conservative. Any spell not in the fallback and with wrong DB data produces a false negative (not flagged) or false positive (incorrectly flagged as purgeable).
- **Aura start before log** — a debuff applied before the log started won't have an APPLIED event, so its duration is measured from the log start, not actual application. Duration calculations are understated.
- **Aura drop on death** — When a unit dies, auras fall off, but sometimes do not generate a clean `REMOVED` event, causing ghost aura tracking.
- **Missed purge attribution** — we know _someone_ on the team could purge, but not _who was free_ at the moment. Now partially addressed via purge blame attribution (F11), but we still don't check if the purger was CC'd at that specific moment.

---

### Healing Gap Detection (`healingGaps.ts`)

| Data used                                                       | Tier  | Reliability | Notes |
| --------------------------------------------------------------- | ----- | ----------- | ----- |
| `unit.healOut` (heal events)                                    | Basic | ✅ Always   |       |
| `unit.spellCastEvents` (SPELL_CAST_SUCCESS for non-heal spells) | Basic | ✅ Always   |       |
| `unit.auraEvents` (CC detection on healer)                      | Basic | ✅ Usually  |       |
| `unit.damageIn` on teammates (pressure check)                   | Basic | ✅ Always   |       |

**Known gaps:**

- **No mana data** — cannot distinguish "healer was intentionally conserving mana" from "healer made a mistake." Requires advanced logging (PowerType 0). Without it, OOM gaps are flagged as mistakes.
- **No position data** — cannot detect LoS gaps. A healer repositioning around a pillar for 3 seconds looks identical to a lapse. Requires advanced logging (advancedActorPositionX/Y).
- **Pressure threshold uses flat 250k fallback** — same issue as panic detection. Without advanced logging, pressure detection is less spec-aware.
- **Absorbs and Channeled Heals** — `healOut` relies heavily on raw heals. Shields logged as `SPELL_ABSORBED` and channels like `SPELL_PERIODIC_HEAL` (Penance, Tranquility) may be misclassified or missed as active healing.
- **3.5s threshold is fixed** — no adaptation to match phase or dampening. A 3.5s gap at 70% dampening is far more consequential than one at 0%.

---

### CC & Trinket Analysis (`ccTrinketAnalysis.ts`)

| Data used                                          | Tier           | Reliability | Notes                                                                  |
| -------------------------------------------------- | -------------- | ----------- | ---------------------------------------------------------------------- |
| `unit.auraEvents` (CC applications on each player) | Basic          | ✅ Usually  |                                                                        |
| `unit.spellCastEvents` (trinket spell ID `336126`) | Basic          | ✅ Always   |                                                                        |
| `unit.info.items` (trinket type detection)         | COMBATANT_INFO | ⚠️ Usually  | Used to classify Gladiator/Adaptation/Relentless                       |
| `unit.damageIn` (damage during CC window)          | Basic          | ✅ Always   |                                                                        |
| `ccSpellIds` (static CC spell list)                | Static         | ⚠️ Partial  | Can miss new CC spells or CC added to existing spells in patch updates |

**Known gaps:**

- **Trinket item ID lists may be stale** — `RELENTLESS_ITEM_IDS` and `ADAPTATION_ITEM_IDS` are hardcoded. New season PvP gear (new item IDs) won't be recognized → trinket classified as Unknown, reducing analysis quality.
- **CC before log start** — a CC applied before the log started won't have an APPLIED event. Duration measured from log start instead of actual application = understated duration.
- **DR not tracked** — CC duration recorded is the raw aura duration, not DR-adjusted. A 2s Paralysis at 75% DR looks the same as a full 6s one. Tracked as F15.
- **Trinket spell ID `336126`** — this is the Gladiator's Medallion proc spell. If Blizzard changes the spell ID in a major patch, trinket usage will stop being detected entirely with no warning.

---

## Summary: Dependency on Advanced Logging

Advanced combat logging (Network settings in WoW) enables `unit.advancedActions`, which provides:

- HP% and max HP at each event
- Mana and other power values
- Position (X/Y coordinates)

**Features that degrade without advanced logging:**

| Feature                | Degradation                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| Panic detection        | Pressure threshold falls back to flat 250k — wrong for tanks/large HP pools |
| Healing gaps           | Cannot distinguish LoS gap from mistake; cannot detect mana OOM             |
| Pressure windows       | Same flat threshold issue                                                   |
| Mana curve (F19)       | Completely impossible without advanced logging                              |
| Positioning analysis   | Completely impossible without advanced logging                              |
| Target selection (F25) | HP% comparison of kill targets not possible                                 |

**Recommendation:** Add a visible warning in the UI when `advancedActions.length === 0` for key players, telling the user that analysis accuracy is reduced and how to enable advanced logging.

---

## Fundamental Limitations (What is Impossible from Logs)

These are boundaries that cannot be solved by more advanced tracking or AI due to log format limitations:
- **Line of Sight (LoS) Detection Is Impossible:** Even with Advanced Combat Logging providing X/Y coordinates, we lack Z-axis (height) and crucially, 3D map collision meshes (pillars, bridges, slopes). LoS cannot be reliably computed.
- **Perfect Player Latency Context:** The parser only sees server timestamp execution. We cannot differentiate between a "panic press / 3.5s healing gap" and the player simply suffering from a 500ms lag spike.
- **True Pre-match State:** We cannot know if a player used a 2-minute cooldown in the starting room 30 seconds before the gates opened. We only begin tracking once they cast something in the active log.
- **Micro-CDR Math Limits:** While we could hardcode math for specific abilities like Shifting Power, calculating dynamic CDR across hundreds of passive talents, random procs, and set bonuses is practically impossible to keep 100% accurate.

---

## Summary: COMBATANT_INFO Dependency

`unit.info` (COMBATANT_INFO) is present when the player was in the arena when it started. Missing when:

- Player loaded after the pull (disconnect reconnect)
- Log file started mid-match
- Some edge cases in solo shuffle

**Features that degrade without COMBATANT_INFO:**

| Feature                | Degradation                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- |
| Cooldown detection     | Talent-gated spells fall back to cast evidence — unreliable for spells never cast |
| Dispel capability      | DH/Warlock purge gating falls back to cast evidence                               |
| Trinket classification | Trinket type unknown → trinket analysis disabled for that player                  |

---

## Static Data Staleness Risk

These files need manual updates after major WoW patches:

| File                                          | Risk                                                                          | Last known issue                          |
| --------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- |
| `spellEffectData`                             | CD values change, new spells missing, dispelType wrong                        | PURGE_BLOCKLIST gap (B7)                  |
| `spellIdLists.json`                           | bigDefensiveSpellIds, externalDefensiveSpellIds may miss new defensive spells | Unknown                                   |
| `ccSpellIds` (spellTags)                      | New CC spells or reclassified existing ones                                   | Unknown                                   |
| `RELENTLESS_ITEM_IDS` / `ADAPTATION_ITEM_IDS` | New season item IDs not added                                                 | Unknown — last updated for old season     |
| `SPEC_EXCLUSIVE_SPELLS`                       | New spec-specific spells not mapped                                           | Unknown                                   |
| `DISPEL_TYPE_FALLBACK`                        | Conservative by design — false negatives preferred                            | Divine Shield not in PURGE_BLOCKLIST (B7) |

---

## Static WoW Data Inventory

All persistent game data files, how they were obtained, and what they're used for.

### `spellEffects.json` — 763 spells

**Location:** `packages/shared/src/data/spellEffects.json`
**Contents:** Per spell ID: name, cooldownSeconds, durationSeconds, dispelType, charge info.
**How generated:** `packages/tools/src/refreshSpellMetadata.ts`

- Downloads CSV tables from Wago.tools DB2 API: SpellCooldowns, SpellCategory, SpellCategories, SpellDuration, SpellMisc, SpellName
- Default build: `12.0.1.66431` (override via `WAGO_BUILD` env var)
- Spell ID set = BigDebuffs spells + AWC/defensive spell lists + ~13 manual additions (Evoker spells not in BigDebuffs)
- **Run:** `npm run start:refreshSpellMetadata` from `packages/tools`

**Used by:** `cooldowns.ts`, `dispelAnalysis.ts`, `enemyCDs.ts`, `healingGaps.ts`, UI components
**Staleness risk:** CD values, durations, and dispelType can change any patch. Wago.tools API must be re-run with the new build number. Missing `durationSeconds` on many spells (used for B9 buff-end tracking).

---

### `spells.json` — 543 spells

**Location:** `packages/shared/src/data/spells.json`
**Contents:** Per spell ID: type (cc/roots/immunities/buffs_offensive/buffs_defensive/etc.), priority flag, display flags.
**How generated:** `packages/tools/src/generateSpellsData.ts`

- Fetches BigDebuffs addon Lua from GitHub (`jordonwow/bigdebuffs`)
- Parses the `Spells` Lua table, normalizes IDs (+1 offset), validates against Wago.tools
- **Run:** `npm run start:generateSpellsData` from `packages/tools`

**Used by:** `dispelAnalysis.ts` (spell type → dispel priority), `enemyCDs.ts`, `healingGaps.ts` (CC type detection), `cooldowns.ts`
**Staleness risk:** BigDebuffs is community-maintained and usually kept current. But new CC spells, reclassifications, or debuff type changes won't auto-appear — requires re-running the generator. The BigDebuffs repo occasionally lags behind PTR changes.

---

### `spellIdLists.json` — 400k+ spell IDs

**Location:** `packages/shared/src/data/spellIdLists.json`
**Contents:** `allSpellIds` (full game list), `importantSpellIds` (269), `externalDefensiveSpellIds` (9), `bigDefensiveSpellIds` (36).
**How generated:** `packages/tools/src/generateSpellIdLists.ts`

- Downloads Spell, SpellMisc, SpellName CSVs from Wago.tools
- Extracts bit flags from `SpellMisc.Attributes_15` / `Attributes_16` columns using SimulationCraft attribute IDs:
  - Important: attribute 491 (SimC PR #10881)
  - External Defensive: attribute 499, Big Defensive: attribute 512 (SimC PR #10901)
- **Run:** `npm run start:generateSpellIdLists` from `packages/tools`

**Used by:** `cooldowns.ts` (`MAJOR_DEFENSIVE_IDS`), `dispelAnalysis.ts` (`BIG_DEFENSIVE_IDS`, `EXTERNAL_DEFENSIVE_IDS`), `awcSpells.ts`
**Staleness risk:** SimC attribute IDs are maintained by the SimulationCraft project. New defensive CDs added by Blizzard may not be flagged until SimC updates their attribute list. The 9 external defensives and 36 big defensives are the highest-risk list — new external CDs (like a new external from a new spec) would be invisible until regenerated.

---

### `talentIdMap.json` — 40 spec talent trees

**Location:** `packages/shared/src/data/talentIdMap.json`
**Contents:** Full talent tree structure per spec — nodes, positions, spell IDs, icons, names, active/passive type.
**How generated:** `packages/tools/src/refreshSpellMetadata.ts` (same script as spellEffects)

- Source: Wago.tools Talent/TraitTree API (Dragonflight+ talent system)
- **Run:** Same as spellEffects refresh

**Used by:** `talents.ts` (talent gating for CD/purge detection), `talentStrings.ts`, `CombatPlayer.tsx`
**Staleness risk:** Talent trees change every patch (nodes added/moved/removed). Stale talent data means talent-gated spells (DH Consume Magic, etc.) may be incorrectly included or excluded. Must be regenerated each major patch.

---

### `spells.json` (classMetadata in parser)

**Note:** Separate from `packages/shared/src/data/spells.json` above. `classMetadata` is a TypeScript object in the `@wowarenalogs/parser` package that maps classes → abilities with `SpellTag` (Offensive/Defensive/Control/etc.) annotations. This is **manually maintained** — no auto-generation script exists.
**Used by:** `cooldowns.ts` (major CD detection), `enemyCDs.ts` (offensive CD detection)
**Staleness risk:** Highest manual maintenance burden. New spells or tag changes require a developer to manually add to classMetadata in the parser package.

---

### `raidbotsEnchantments.json` — 557 enchantments

**Location:** `packages/shared/src/data/raidbotsEnchantments.json`
**Contents:** Enchantment ID, name, spell ID, slot, stats, item associations.
**How obtained:** Downloaded from Raidbots live API (`https://www.raidbots.com/static/data/live/enchantments.json`). **No auto-refresh script** — manually downloaded and committed.
**Used by:** `enchantsMap.ts` (enchantment display in combat reports)
**Staleness risk:** New season enchants won't appear until manually re-downloaded. Low priority for AI analysis features.

---

### `zoneMetadata.ts` — arena zones

**Location:** `packages/shared/src/data/zoneMetadata.ts`
**Contents:** Per arena zone: zone ID, name, image dimensions, X/Y coordinate bounds for positioning overlay.
**How obtained:** **Fully manually curated** — no generation script.
**Used by:** Combat replay positioning UI
**Staleness risk:** New arenas added each season require manual addition.

---

### `ccSpellIds` in `spellTags.ts`

**Location:** `packages/shared/src/data/spellTags.ts`
**Contents:** TypeScript enum and a `ccSpellIds` set of spell IDs classified as CC.
**How obtained:** **Manually curated** — derived from `spells.json` but maintained by hand.
**Used by:** `ccTrinketAnalysis.ts` (CC detection per player)
**Staleness risk:** New CC spells require manual addition. This list is the authoritative source for what counts as "CC" in trinket/CC analysis.

---

## Update Commands (Quick Reference)

```bash
# From packages/tools/
npm run start:generateSpellsData      # BigDebuffs → spells.json
npm run start:generateSpellIdLists    # Wago.tools → spellIdLists.json
npm run start:refreshSpellMetadata    # Wago.tools → spellEffects.json + talentIdMap.json

# Override WoW build version:
WAGO_BUILD=12.1.0.12345 npm run start:refreshSpellMetadata
```

**Recommended cadence:** Run all three after each major WoW patch (x.y.0 releases). Minor patches (x.y.z) only need a refresh if Blizzard changed CD values or spell classifications.
