# AI Arena Analysis — Feature Backlog

Features for the AI cooldown analysis system. Each is designed to be independently
developable (separate utility + API route update + component section).

---

## Design Philosophy

This tool is designed for **advanced players** (top 0.5% rating) who already play correctly
most of the time. That means:

- **No rule-based flagging** ("you had X available and didn't use it"). Existing tools like
  ArenaCoach.gg already do this and it's not useful at high level.
- **Timing and context matter** — using the right CD 15 seconds late during a burst window
  is a real mistake; using it 5 seconds early is also wrong. The analysis must cross-reference
  your actions against enemy actions.
- **Counterfactual framing** — "if you had held Cocoon 8 seconds longer, it would have
  covered both damage spikes instead of just the first one."
- **Covers all healers**, not spec-specific. Logic should infer appropriate behavior from
  `owner.spec`.

### Prior Art Research (2026-03)
- **ArenaCoach.gg** — rule-based mistake detection (broken CC chains, missed kicks, bad
  defensive timing). Good for beginners, not useful at high level.
- **Ultima AI (ai.pvpq.net)** — trained by 20+ AWC pros, scores 10 dimensions, uses
  Claude/GPT. Most sophisticated competitor.
- **Gaps in existing tools**: healer-specific deep analysis, dispel efficiency, healing gaps,
  mana curve, cooldown trading timelines. Most tools are DPS-focused.

---

## Already Built

### ✅ Cooldown Usage Analysis
- Extracts major tagged CDs (≥30s) from combat log
- Computes cast times and idle availability windows
- Cross-references with incoming damage pressure windows
- Files: `scripts/testAnalyze.mjs`, `packages/shared/src/utils/cooldowns.ts`,
  `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`,
  `packages/web/pages/api/analyze.ts`

---

## Feature Priority Matrix

| # | Feature | Complexity | Gain (advanced) | Cluster |
|---|---------|-----------|-----------------|---------|
| 7 | Enemy CD Timeline | Medium | **High** | Tempo |
| 8 | CD Rotation Simulation | High | **High** | Tempo |
| 9 | DR Chain Tracking | Medium | **High** | Tempo |
| 12 | Kill Window Quality | Medium | **High** | Tempo |
| 2 | CC During Enemy Burst | Medium | **High** | Reaction |
| 3 | CC Received / Trinket | Medium | **Medium-High** | Reaction |
| 1 | Dispel Analysis | Low | Medium | Healer |
| 4 | Healing Gap Detection | Low | Medium | Healer |
| 5 | Mana Curve | Low | Medium | Healer |
| 10 | Dampening Curve | Low | **High** | Healer |
| 11 | Interrupt Analysis | Low | Medium | Healer |
| 6 | Positioning | Medium | Low-Medium | Positioning |

**Build order recommendation:** Start with the Tempo cluster (7, 9, 12) + Healer fast wins
(1, 4, 5, 10, 11), then Reaction cluster (2, 3), then the CD Simulation (8), then Positioning (6).

---

## Feature Backlog

### 1. Dispel Analysis
**Priority: Medium | Complexity: Low**

Detect how long dangerous debuffs sat on your teammates before you dispelled them (or didn't).
Value at high level: not whether you dispelled, but *timing* relative to incoming damage pressure.

**What to measure:**
- For every `SPELL_AURA_APPLIED` on a friendly player with a dispellable debuff type:
  - Time from application to your `SPELL_DISPEL` for that aura
  - Whether it was never dispelled at all
- Cross-reference with incoming damage during the debuff window
- Flag by healer dispel capability (Magic/Poison/Curse/Disease/Enrage — spec-dependent)
- Rank by danger tier: Mortal Strike (healing reduction), fears, roots, silences

**Data sources:** `unit.auraEvents`, `unit.actionOut` (SPELL_DISPEL events)

**AI prompt addition:** "You let [debuff] sit for X seconds on [spec] — during that window they
took Y damage and healing received was reduced by 25%."

**Files to create/modify:**
- `packages/shared/src/utils/dispels.ts` — `extractDispelEvents(unit, combat)`
- `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx` — add dispel section
- `scripts/testAnalyze.mjs` — add dispel context block

---

### 2. CC During Enemy Burst
**Priority: High | Complexity: Medium**

Detect when the enemy team popped offensive cooldowns and check if you responded with CC.
At high level: not just *did* you CC, but *which* CC and *how far into* the burst window.

**What to measure:**
- Find enemy `SPELL_CAST_SUCCESS` for offensive CDs (Avenging Wrath, Dark Transformation,
  Storm Earth and Fire, Deathmark, etc.)
- In the 5 seconds after each enemy offensive CD: which CC did you cast, and when?
- Flag burst windows where you had CC available but used it late, or chose a suboptimal CC
- Cross-reference DR state (see Feature 9) — was the CC going to be a diminished hit?

**Data sources:** `unit.spellCastEvents` for both enemy and self units, `classMetadata`
offensive tags

**AI prompt addition:** "Enemy Ret Paladin used Avenging Wrath at 2:14. You had Paralysis
available (last cast at 1:29, 45s CD). No CC was used for 18 seconds into the burst window."

**Files to create/modify:**
- `packages/shared/src/utils/burstWindows.ts` — `extractEnemyBurstWindows(enemies, combat)`,
  `computeCCResponse(owner, burstWindows, combat)`
- `scripts/testAnalyze.mjs` — add burst window context block

---

### 3. CC Received at Bad Moments (Trinket Evaluation)
**Priority: Medium-High | Complexity: Medium**

Detect whether you were CCed during critical healing moments, and whether trinket usage was
optimal. At high level: the key mistake is trinketing a minor CC before a major one lands.

**What to measure:**
- For each CC received on you (`unit.auraEvents` with CC spell IDs on owner):
  - Were your teammates taking heavy damage during that window?
  - Did you trinket? How long after the CC landed?
  - What was the next CC after your trinket? Was it a longer/heavier one?
- Trinket waste: did you trinket a minor CC (short duration, low-pressure moment) and then
  get hit by a major CC with no trinket?

**Data sources:** `unit.auraEvents` (CC on owner), `ccSpellIds` from `spellTags.ts`,
`unit.damageIn` for teammates

**AI prompt addition:** "You were stunned at 1:45 for 4 seconds — your Druid took 0.62M
damage during that stun. You did not trinket. Your trinket had been available since 0:15."

**Files to create/modify:**
- `packages/shared/src/utils/ccReceived.ts` — `extractCCReceivedEvents(owner, friendlies, combat)`
- `scripts/testAnalyze.mjs` — add CC received context block

---

### 4. Healing Gap Detection
**Priority: Medium | Complexity: Low**

Find windows where your healing output dropped to near zero while your team was taking damage.
At high level: distinguish CCed gaps (unavoidable) from free-cast gaps (decision errors).

**What to measure:**
- Bucket `healOut` events into 3-second windows
- Find windows where: (a) you cast no heals AND (b) a friendly player was taking significant
  damage
- Cross-reference with CC received on owner — was the gap unavoidable?
- Flag only non-CCed healing gaps as mistakes

**Data sources:** `unit.healOut`, `unit.damageIn` for friendlies, CC received on owner

**AI prompt addition:** "From 3:22 to 3:31 (9 seconds) you cast no heals while your Warlock
was taking 0.41M damage. You were not CCed during this window."

**Files to create/modify:**
- `packages/shared/src/utils/healingGaps.ts` — `computeHealingGaps(owner, friendlies, combat)`
- `scripts/testAnalyze.mjs` — add healing gaps context block

---

### 5. Mana Curve Analysis
**Priority: Medium | Complexity: Low**

Track mana levels over the match and identify if mana management affected performance.
High value in long matches and post-dampening windows.

**What to measure:**
- Extract mana values from `advancedActions` (PowerType 0 = Mana)
- Plot mana % over time; detect when mana dropped below 20% vs. 40% thresholds
- Mana Tea / mana regeneration timing vs. low-mana windows
- Flag if mana dropped below 20% during high-pressure windows
- Detect overuse of expensive heals when mana was already low

**Data sources:** `unit.advancedActions` → `advancedActorPowers` (PowerType 0 = Mana)

**AI prompt addition:** "Your mana dropped to 14% at 4:30 — during the heaviest pressure
window of the match. Mana Tea was last used at 2:15 and had been available again since 3:15."

**Files to create/modify:**
- `packages/shared/src/utils/manaAnalysis.ts` — `extractManaCurve(owner, combat)`,
  `computeManaPressureWindows(owner, combat)`
- `scripts/testAnalyze.mjs` — add mana context block

---

### 6. Positioning Analysis
**Priority: Low-Medium | Complexity: Medium**

Use X/Y coordinates from advanced log data to evaluate healer positioning.
Note: coordinates exist but no map/pillar context — analysis will be limited.

**What to measure:**
- Distance from each teammate over time (`advancedActorPositionX/Y` on damage events)
- Flag moments when you were >40 yards from a teammate being attacked
- Detect if you were in melee range of enemy DPS (increases CC risk)
- Average distance to kill-target teammate vs. safe distance

**Data sources:** `CombatAdvancedAction.advancedActorPositionX/Y` on `damageIn` events

**AI prompt addition:** "At 1:10 your Balance Druid was taking heavy damage 55 yards away —
outside Life Cocoon range (40 yards). You may have been LoS'd or out of position."

**Files to create/modify:**
- `packages/shared/src/utils/positioning.ts` — `extractPositionTimeline(unit, combat)`,
  `computeDistanceViolations(owner, friendlies, combat)`
- `scripts/testAnalyze.mjs` — add positioning context block

---

### 7. Enemy CD Timeline Reconstruction
**Priority: High | Complexity: Medium**

Infer when enemy offensive CDs were available throughout the match so you can anticipate
the next burst. Core of high-level play — most existing tools don't do this.

**What to measure:**
- For each enemy player: track all `SPELL_CAST_SUCCESS` for tagged offensive CDs
- Compute availability windows: cast at T, CD = X seconds → available again at T+X
- Overlay with your team's incoming damage: "the UDK's Apocalypse came back at 3:30 —
  that's when the second damage spike started"
- Show when enemy had multiple offensive CDs aligned (peak danger windows)

**Data sources:** `unit.spellCastEvents` for enemy units, `classMetadata` offensive spell
tags, `spellEffects.json` for cooldown durations

**AI prompt addition:** Full enemy CD timeline per player, showing when each major offensive
CD was up/down throughout the match. Cross-reference with your defensive CD usage.

**Files to create/modify:**
- `packages/shared/src/utils/enemyCDs.ts` — `reconstructEnemyCDTimeline(enemies, combat)`
- `scripts/testAnalyze.mjs` — add enemy CD timeline to context

---

### 8. Optimal CD Rotation Simulation
**Priority: High | Complexity: High | Highest ceiling feature**

Given the actual damage timeline, compute what the optimal CD usage sequence would have been.
The key counterfactual question for advanced players: "would holding X for 8 more seconds
have changed the outcome?"

**What to measure:**
- Model your CD kit as a set of resources with cooldowns
- Given the actual incoming damage events, reason through which CD sequence minimises peak
  unmitigated damage
- Compare to what actually happened: "Using Life Cocoon at 1:10 instead of 2:20 would have
  reduced peak damage taken by your Druid by 34% and had it available again at 3:10 for the
  second spike"
- Account for enemy CD timeline (Feature 7) — the optimal sequence depends on when enemy
  CDs are coming back

**Data sources:** All pressure windows, `extractMajorCooldowns` output, enemy CD timeline

**Implementation note:** Best done entirely by the AI (prompt Claude to reason through the
timeline) rather than as a deterministic algorithm.

**Files to create/modify:**
- `packages/shared/src/utils/cdSimulation.ts` — `buildCDSimulationContext(owner, combat)`
  (produces structured text for Claude to reason over)
- `packages/web/pages/api/analyze.ts` — extend prompt for simulation mode

---

### 9. DR Chain Tracking *(NEW)*
**Priority: High | Complexity: Medium**

Track diminishing returns (DR) on CC targets — both received and applied. At high level,
understanding DR state determines whether a CC is worth casting and whether an enemy CC
will be full duration.

**What to measure:**
- For every CC applied to any player (`SPELL_AURA_APPLIED` with CC spell IDs):
  - Track DR category and DR counter per target
  - Compute effective duration after DR (full / 50% / 25% / immune)
- CC received on you: how often were you re-CCed while DR was active (partial CC windows)?
- CC applied by your team: did you re-CC before DR reset? (wasted CC)
- Flag enemy DR resets — windows where the enemy was fully vulnerable to CC again

**Data sources:** `unit.auraEvents` (CC spells), DR categories from `spellTags.ts`

**AI prompt addition:** "At 3:45 you Paralyzed the enemy Warlock but they were at 50% DR
(Paralysis used 18s ago). Effective duration: 3 seconds instead of 6. Enemy DPS was
uncapped on your Druid for that window."

**Files to create/modify:**
- `packages/shared/src/utils/drTracking.ts` — `buildDRTimeline(units, combat)`,
  `computeEffectiveCCDuration(spellId, drState)`
- `scripts/testAnalyze.mjs` — add DR timeline to context

---

### 10. Dampening Curve *(NEW)*
**Priority: High | Complexity: Low**

Track healing reduction from Dampening (arena mechanic: starts at 0%, grows by ~10%/min
in 3v3 after 2:00, accelerating in longer matches) and identify when it made your healing
insufficient to sustain your team.

**What to measure:**
- Compute dampening % at each timestamp based on match duration
- Apply dampening multiplier to actual healing done — show "effective healing" vs. raw healing
- Find the timestamp where your healing could no longer keep pace with incoming damage
- Cross-reference with mana curve (Feature 5): were you mana-limited OR dampening-limited?
- Flag matches where an earlier kill opportunity (Feature 12) would have avoided dampening
  becoming decisive

**Data sources:** Match duration from `combat.startTime`/`endTime`, `unit.healOut`,
`unit.damageIn`

**AI prompt addition:** "At 4:00 dampening reached 30%. Your net healing dropped below the
incoming damage threshold at 4:22 — 22 seconds into critical dampening. At that point
winning required a kill, not surviving."

**Files to create/modify:**
- `packages/shared/src/utils/dampening.ts` — `computeDampeningCurve(combat)`,
  `computeEffectiveHealing(healOut, dampening)`
- `scripts/testAnalyze.mjs` — add dampening context block

---

### 11. Interrupt Analysis *(NEW)*
**Priority: Medium | Complexity: Low**

Track which enemy casts were interrupted vs. let through, and estimate the cost of missed
kicks.

**What to measure:**
- For every `SPELL_INTERRUPT` cast by your team: which cast was stopped, who was the target
- For enemy casts that completed (`SPELL_CAST_SUCCESS`): was an interrupt available?
- Estimate damage/heal value of casts that landed unninterrupted
- Flag high-value missed kicks (e.g. enemy healer's big heal, enemy DPS burst spell)

**Data sources:** `unit.actionOut` (SPELL_INTERRUPT), `unit.spellCastEvents` for enemies,
`spellEffects.json` for spell type classification

**AI prompt addition:** "The enemy Holy Paladin cast Barrier at 2:30 uninterrupted — your
Windwalker's Spear Hand Strike was available (last used at 1:00, 15s CD). Your team had
dealt 0.8M damage in the following 8 seconds before the barrier expired."

**Files to create/modify:**
- `packages/shared/src/utils/interrupts.ts` — `extractInterruptEvents(units, combat)`,
  `computeMissedInterrupts(enemies, friendlies, combat)`
- `scripts/testAnalyze.mjs` — add interrupt context block

---

### 12. Kill Window Quality *(NEW)*
**Priority: High | Complexity: Medium**

On your offensive windows — did your team coordinate CDs onto the same target at the same
time? At high level, uncoordinated offensive windows are how winning comps lose.

**What to measure:**
- Identify offensive CD clusters: windows where multiple players cast offensive CDs within
  5 seconds of each other
- Check if damage was focused on a single target during those windows
- Measure whether the enemy healer was CCed during the kill window
- Compare kill window CD overlap to actual damage spikes — did the burst actually land?
- Flag wasted go windows: CDs used but spread across different targets, or healer not CCed

**Data sources:** `unit.spellCastEvents` for all players, `classMetadata` offensive tags,
`unit.damageIn` for enemies, CC applied to enemy healer

**AI prompt addition:** "At 2:15 you and your DPS had 3 offensive CDs within a 4s window.
Your DPS split damage between the Warrior (0.4M) and the Paladin healer (0.3M). The Paladin
was not CCed during this window. A focused go with CC on the Paladin healer may have
converted this into a kill."

**Files to create/modify:**
- `packages/shared/src/utils/killWindows.ts` — `extractKillWindows(allUnits, combat)`,
  `evaluateKillWindowQuality(windows, combat)`
- `scripts/testAnalyze.mjs` — add kill window context block

---

## Development Notes

- Each feature adds a new block to the context text sent to the AI — they are **additive and
  independent**
- The AI prompt in `packages/web/pages/api/analyze.ts` may need tuning as more context is
  added (watch token limits; consider summarising lower-priority blocks)
- **Recommended first sprint:** Features 7, 9, 10 (Tempo cluster + Dampening) — high gain,
  medium/low complexity, provide the most context enrichment for the AI
- **Second sprint:** Features 1, 4, 5, 11 (healer fast wins) — all low complexity
- **Third sprint:** Features 2, 3, 12 (reaction + kill windows)
- **Final:** Feature 8 (CD simulation) and Feature 6 (positioning)
- All utility functions should be usable by both the web component (`CombatAIAnalysis`) and
  the test script (`scripts/testAnalyze.mjs`)
- All healer-specific logic must support all healer specs, not just Mistweaver
