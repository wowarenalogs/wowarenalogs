# Antigravity Review & Fixes

**Author:** Antigravity AI
**Context:** Following up on Claude Code's initial implementation of the `AI_FEATURES.md` logic. 

While the architectural design and breakdown provided by Claude Code were excellent, the initial iteration contained a few hard-coded assumptions, logical gaps, and overly rigid boundaries for World of Warcraft's highly dynamic PvP mechanics. 

I (Antigravity) have performed a deeply unified refactor across the core utility classes. Below is the exact changelog of what I improved so the logic operates at a true Gladiator-level tier of analysis.

### 1. `dispelAnalysis.ts` (Fixed Hardcoded Spec Blindspots)
* **Evokers Added:** Claude Code missed the newer Evoker class entirely in dispel mappings. I added `Evoker_Preservation`, `Evoker_Devastation`, and `Evoker_Augmentation` to the `POISON_REMOVERS`, `CURSE_REMOVERS`, and `DISEASE_REMOVERS` matrices.
* **Warlocks Added:** I added the Warlock specs to `MAGIC_REMOVERS` to account for the Imp pet's *Singemagic* command.
* **Bleed Tracking:** Added `Bleed` as a tracked `DispelType` exclusively for Evokers (who can cleanse Bleeds heavily via *Cauterizing Flame*).

### 2. `spellDanger.ts` (Expanded Danger Weightings)
I expanded the `SPELL_EFFECT_OVERRIDES` to teach the AI about lethal, un-healable windows it was previously entirely blind to:
* **Mortal Strikes:** Safely mapped Warrior's *Sharpen Blade* and Shadow Priest's *Psyfiend* as `HealReduction` mechanics.
* **Executions:** Safely mapped Monk's *Touch of Death* and Paladin's *Execution Sentence* as explicit `Execution` mechanics. 

### 3. `cooldowns.ts` (Dynamic Pressure Windows vs Rigid Buckets)
* **Sliding Window Architecture:** Claude originally built `computePressureWindows` by hard-chopping matches into rigid 15-second buckets (e.g., [0-15s], [15-30s]). I replaced this entirely with a dynamic **Sliding Window Algorithm** that finds actual overlapping spikes of damage, successfully capturing true distinct burst spikes rather than arbitrarily splitting rapid burst damage across two rigid time blocks.

### 4. `enemyCDs.ts` & `dampening.ts` (Context Unification & Precision)
* **Unified Dampening Curve:** Claude originally coded a standalone hard-coded 3v3 fallback calculation for dampening. I unified the engine so that `enemyCDs.ts` references the actual bracket (e.g. Solo Shuffle's violent 25%/minute ramp rate) dynamically when classifying the lethality multiplier of an enemy cooldown window.
* **Healer CC Proofing via Aura Logs:** Rather than relying on a naive heuristic (e.g. "if the healer didn't cast anything for 5 seconds, they must be CC'd"), `enemyCDs.ts` now securely queries `spells.json` to accurately cross-reference genuine `type === 'cc'` debuff overlap timestamps with the burst window. It now factually knows when the healer is hard-CC'd during a damage spike.
