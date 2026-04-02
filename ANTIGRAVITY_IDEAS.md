# Antigravity's Recommended Backlog & Ideas

**Author:** Antigravity AI  
**Purpose:** This document records high-level concepts and mathematical modeling ideas devised by Antigravity during deep brainstorming. These features represent the next generation of PvP logic and should be handed off to another agent (e.g., Claude) to implement in the TypeScript utilities.

---

## 1. Offensive Purge Tracking (`dispelAnalysis.ts`)
**Concept:** Currently, the system only penalizes teams for failing to defensively cleanse allies. It entirely ignores offensive stripping.
**Implementation Blueprint:**
1. Create mapping of `OFFENSIVE_PURGERS` (e.g., Shaman `Purge`, Priest `Dispel Magic`, Mage `Spellsteal`, Warlock `Devour Magic`, Demon Hunter `Consume Magic`).
2. Scan enemy units' `auraEvents` for `Critical` and `High` priority magic/enrage buffs (e.g., *Combustion*, *Blessing of Protection*).
3. If the buff remains on the enemy for > 3 seconds, and a friendly offensive purger was alive and not CC'd, generate a `missedPurgeWindow`.

## 2. Fatal / Bad Dispel Flagging (`dispelAnalysis.ts`)
**Concept:** Instead of merely ignoring dangerous dispels, the backend should actively flag when a healer takes the bait and makes a game-losing dispel.
**Implementation Blueprint:**
1. Identify when an aura matching `DISPEL_PENALTY_SPELLS` (e.g., *Unstable Affliction*) is removed via `SPELL_DISPEL`.
2. Grab the friendly agent who cast the dispel.
3. Calculate the damage taken and CC suffered (UA silences) by the dispeller in the immediate 4 seconds following the dispel.
4. Output a `fatalDispelPenalty` event detailing exactly how much backlash they took.

## 3. Offensive Vulnerability Windows (`cooldowns.ts`)
**Concept:** Defensive "Pressure Windows" currently exist, tracking when friendlies took damage. We need the inverse to test if DPS capitalized on enemy weaknesses.
**Implementation Blueprint:**
1. Compute windows where a specific enemy target has:
   - Below 30% health.
   - PvP Medallion on cooldown.
   - Core defensive cooldowns (e.g., *Ice Block*, *Pain Suppression*) unavailable.
2. Flag this as an `enemyVulnerabilityWindow`.
3. Give the AI context on whether friendly DPS used their offensive cooldowns during this exact window.

## 4. Dynamic Cooldown Reduction Heuristics (`cooldowns.ts`)
**Concept:** The static CD timer mathematical model is blind to major WoW CDR mechanics, leading to false negatives.
**Implementation Blueprint:**
1. Scan for major CDR events (e.g., Mage casting *Shifting Power*, Paladin casting *Wake of Ashes*).
2. When observed, actively subtract the respective seconds from the tracked `cdReadyAt` properties for that unit.
3. This will make the "Available uptime" equations dramatically more accurate for CDR-heavy specs.
