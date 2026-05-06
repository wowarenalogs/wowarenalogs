# Missed Opportunity Analysis — Design Spec

**Date:** 2026-05-05
**Branch:** feat/missed-opportunity-analysis (to be created)
**Motivation:** ArenaCoach.gg's public mistake catalog (18 types, fetched from `/api/mistake-catalog`) was used as a gap analysis against existing utilities. This spec covers the 4 gaps with the most LLM value that are not yet captured as context inputs.

---

## Background

ArenaCoach.gg detects mistakes via rule-based flagging. This project explicitly avoids that approach for high-level players — instead, it builds structured context that Claude reasons over counterfactually. The goal here is not to replicate ArenaCoach's rules, but to surface the _facts_ those rules point at so Claude can evaluate them in context.

The 4 gaps selected (from 18 ArenaCoach types):

- **#4** Died with immunity available (player had Divine Shield / Ice Block / etc. up when they died)
- **#5** Teammate died without external defensive (Ironbark, Pain Suppression, etc. was available and caster was free)
- **#6** High-value damage pressed into immunity or major DR
- **#7** Healer tanked full-duration CC with an avoidance tool available

Coverage already exists for the other ArenaCoach categories: DR chain analysis (`drAnalysis.ts`), dispel/cleanse (`dispelAnalysis.ts`), trinket state (`ccTrinketAnalysis.ts`), CD idle windows (`cooldowns.ts` `availableWindows`).

---

## Design

### 1. `deathOutcomeAnalysis.ts` (new file)

Covers #4 and #5. Groups them because both share the same structure: death timestamp → CD availability lookup → CC state check.

#### Prerequisite: Extend `SPELL_COOLDOWN_MAP` in `cooldowns.ts`

Several required spells are not currently tracked by `extractMajorCooldowns()`. Add them before implementing the utilities:

| Spell ID | Name                   | Spec                | Used by               |
| -------- | ---------------------- | ------------------- | --------------------- |
| 642      | Divine Shield          | Paladin (all)       | immunity check        |
| 45438    | Ice Block              | Mage (all)          | immunity check        |
| 186265   | Aspect of the Turtle   | Hunter (all)        | immunity check        |
| 196555   | Netherwalk             | DH Vengeance        | immunity check        |
| 47788    | Guardian Spirit        | Priest Holy         | external defensive    |
| 1022     | Blessing of Protection | Paladin (all)       | external defensive    |
| 633      | Lay on Hands           | Paladin (all)       | external defensive    |
| 586      | Fade                   | Priest (Holy, Disc) | healer avoidance (#7) |
| 8177     | Grounding Totem        | Shaman Restoration  | healer avoidance (#7) |
| 122783   | Diffuse Magic          | Monk Mistweaver     | healer avoidance (#7) |
| 374251   | Obsidian Scales        | Evoker Preservation | healer avoidance (#7) |

Once in the map, `extractMajorCooldowns()` automatically computes `availableWindows` for these spells.

#### Inputs

- `IArenaMatch` or `IShuffleRound`
- Pre-computed `IMajorCooldownInfo[][]` from `extractMajorCooldowns()` — already computed per-player via `teammateCooldowns` in `buildMatchContext`; death timestamps accessed via `p.deathRecords` on each `ICombatUnit`
- CC state from `ccTrinketAnalysis.ts` `IPlayerCCTrinketSummary` (for hard-CC-at-death check)

#### Immunity spell list (constants in file)

```typescript
const IMMUNITY_SPELLS: Record<number, { name: string; spec?: CombatUnitSpec[] }> = {
  642: { name: 'Divine Shield' },
  45438: { name: 'Ice Block' },
  47585: { name: 'Dispersion' },
  186265: { name: 'Aspect of the Turtle' },
  196555: { name: 'Netherwalk', spec: [CombatUnitSpec.DemonHunter_Vengeance] },
};
```

Forbearance (25771) and Hypothermia (41425) are tracked as lockout auras — if active at death time, the immunity is excluded from `availableImmunities`.

#### External defensive spell list

```typescript
const EXTERNAL_DEFENSIVE_SPELLS: Record<number, { name: string }> = {
  102342: { name: 'Ironbark' },
  33206: { name: 'Pain Suppression' },
  47788: { name: 'Guardian Spirit' },
  1022: { name: 'Blessing of Protection' },
  633: { name: 'Lay on Hands' },
  116849: { name: 'Life Cocoon' },
};
```

#### CC excuse logic

At each death timestamp:

- **Dying player:** was any hard-CC aura (`Stun`, `Incapacitate`, `Disorient`) active AND no trinket available? If so, immunity miss is flagged `wasInCC: true`. Still surfaced — CC'd players could still have pressed before the CC landed.
- **External caster:** was any hard-CC aura active on them at the death timestamp? If so, `casterWasInCC: true`.

#### Output types

```typescript
export interface IDeathImmuneAvailable {
  spellId: number;
  spellName: string;
  wasInCC: boolean;
}

export interface IMissedExternal {
  casterName: string;
  casterSpec: string;
  spellId: number;
  spellName: string;
  casterWasInCC: boolean;
}

export interface IDeathOutcomeEvent {
  deadPlayer: string;
  deadPlayerSpec: string;
  atSeconds: number;
  availableImmunities: IDeathImmuneAvailable[];
  missedExternals: IMissedExternal[];
}

export interface IDeathOutcomeSummary {
  events: IDeathOutcomeEvent[]; // only deaths where at least one list is non-empty
}

export function buildDeathOutcomeSummary(
  combat: IArenaMatch | IShuffleRound,
  friends: ICombatUnit[],
  cdSummaries: IMajorCooldownInfo[][], // one array per friendly player, same order as friends
  ccSummaries: IPlayerCCTrinketSummary[],
): IDeathOutcomeSummary;
```

---

### 2. `offensiveWasteAnalysis.ts` (new file)

Covers #6. Detects when a player pressed ≥2 high-value damage casts into an enemy protected by immunity or major DR.

#### Defense detection

Watch `SPELL_AURA_APPLIED` / `SPELL_AURA_REMOVED` on enemy units for two tiers:

```typescript
const IMMUNITY_AURAS: Record<number, string> = {
  642: 'Divine Shield',
  45438: 'Ice Block',
  47585: 'Dispersion',
  186265: 'Aspect of the Turtle',
};

const MAJOR_DR_AURAS: Record<number, string> = {
  102342: 'Ironbark',
  33206: 'Pain Suppression',
  264735: 'Survival of the Fittest',
  22812: 'Barkskin',
  498: 'Divine Protection',
};
```

#### High-value cast detection

"High-value" is defined as: any `SPELL_CAST_SUCCESS` by the player against that target where the spell appears in `spellEffectData` as a major cooldown, OR where it contributed ≥5% of the player's total damage output for the match. This avoids a hardcoded per-spec spell list that would need patch maintenance.

#### Thresholds

- `immunity`: ≥2 casts during the window → flagged
- `major_dr`: ≥3 casts during the window → flagged (less egregious than full immunity)

#### Output types

```typescript
export interface IOffensiveWasteCast {
  spellId: number;
  spellName: string;
  atSeconds: number;
}

export interface IOffensiveWasteEvent {
  casterName: string;
  casterSpec: string;
  targetName: string;
  targetSpec: string;
  defenseType: 'immunity' | 'major_dr';
  defenseName: string;
  defenseWindowSeconds: [number, number];
  wasteCasts: IOffensiveWasteCast[];
}

export interface IOffensiveWasteSummary {
  events: IOffensiveWasteEvent[];
}

export function buildOffensiveWasteSummary(
  combat: IArenaMatch | IShuffleRound,
  friends: ICombatUnit[],
  enemies: ICombatUnit[],
): IOffensiveWasteSummary;
```

---

### 3. Extend `healerExposureAnalysis.ts` (#7)

A new parallel export `buildHealerCCReceivedEvents()` is added to the existing file. The existing `buildHealerBurstExposure()` function is unchanged.

#### What changes

New constants block for healer avoidance CDs (per spec):

```typescript
const HEALER_AVOIDANCE_SPELLS: Partial<Record<CombatUnitSpec, Array<{ spellId: number; name: string }>>> = {
  [CombatUnitSpec.Shaman_Restoration]: [{ spellId: 8177, name: 'Grounding Totem' }],
  [CombatUnitSpec.Priest_Holy]: [{ spellId: 586, name: 'Fade' }],
  [CombatUnitSpec.Priest_Discipline]: [{ spellId: 586, name: 'Fade' }],
  [CombatUnitSpec.Paladin_Holy]: [{ spellId: 642, name: 'Divine Shield' }],
  [CombatUnitSpec.Monk_Mistweaver]: [{ spellId: 122783, name: 'Diffuse Magic' }],
  [CombatUnitSpec.Evoker_Preservation]: [{ spellId: 374251, name: 'Obsidian Scales' }],
};
```

#### Teammate pressure gate

Only emit an event when ≥1 teammate was below 75% HP at CC-land time (same gate ArenaCoach uses). Neutral-state CC is not flagged.

#### Avoidance tool availability check

For each CC aura applied to the healer, check if any of their avoidance tools had a continuous `availableWindow` for ≥1.5s at the CC timestamp. Uses the same `extractSpellCooldowns` pipeline.

#### New types

```typescript
export interface IHealerAvoidanceTool {
  spellId: number;
  spellName: string;
  availableSinceSeconds: number; // how long it had been continuously off CD
}

export interface IHealerCCReceived {
  atSeconds: number;
  ccSpellName: string;
  ccCategory: string;
  durationSeconds: number;
  teammateLowHp: boolean;
  avoidanceToolsAvailable: IHealerAvoidanceTool[]; // empty = nothing could have helped
}

export function buildHealerCCReceivedEvents(
  combat: IArenaMatch | IShuffleRound,
  healer: ICombatUnit,
  cdSummaries: IMajorCooldownInfo[][], // one array per friendly player, same order as friends
  ccSummary: IPlayerCCTrinketSummary,
): IHealerCCReceived[];
```

---

### 4. LLM Context Integration

All three outputs are added to `buildMatchContext()` in `CombatAIAnalysis/index.tsx` under the existing SUPPORTING DATA section.

#### Formatting

**Death outcome block** (omitted if zero events):

```
DEATHS WITH MISSED OPTIONS
  [2:34] Warrior — had Divine Shield available (idle 45s), was not CC'd
  [3:12] Druid — Priest had Pain Suppression available and was free
```

**Offensive waste block** (omitted if zero events):

```
ABILITIES INTO IMMUNITY/DR
  [1:45] DH: Chaos Strike + The Hunt into Mage's Ice Block (7.2s window)
  [2:20] Warrior: Mortal Strike + Execute + Bladestorm into Ironbark
```

**Healer CC received block** (appended to existing healer CC section):

```
HEALER CC RECEIVED
  [1:10] Polymorph (8s) — Fade available 12s prior, Warrior at 55% HP
  [2:44] Fear (6s) — no avoidance tools available
```

#### No new system prompt instructions needed

The existing system prompt instructs Claude to reason counterfactually about available options. These blocks provide the specific facts; Claude applies the existing reasoning framework.

---

## Scope Boundaries

- No rule-based flagging — these utilities produce facts, not verdicts
- No Blessing of Sanctuary detection (spec-specific Ret Paladin, low ROI)
- No CC-held-too-long expansion — `availableWindows` already feeds the LLM for tracked CDs
- No missed interrupt / broke-CC / missed CC detection (too simple, low LLM value per user decision)
- All three utilities cover all roles (not healer-centric only)

---

## Files Changed

| File                                                                     | Change                                |
| ------------------------------------------------------------------------ | ------------------------------------- |
| `packages/shared/src/utils/deathOutcomeAnalysis.ts`                      | New                                   |
| `packages/shared/src/utils/offensiveWasteAnalysis.ts`                    | New                                   |
| `packages/shared/src/utils/healerExposureAnalysis.ts`                    | Extend with new export + types        |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx` | Wire all 3 into `buildMatchContext()` |
