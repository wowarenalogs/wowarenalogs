# Resource Audit Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject a `[RESOURCES]` ground-truth snapshot after every CD event in the match timeline, and upgrade `NEW_SYSTEM_PROMPT` with counterfactual resource-efficiency reasoning rules.

**Architecture:** Two independent layers — (1) a new `buildResourceSnapshot()` helper in `utils.ts` that computes friendly CD ready/CD state, enemy active CDs, and full-team CC state at a given timestamp, wired inline after each `[OWNER CD]` / `[TEAMMATE CD]` entry; (2) a new shared prompt file `analyzeSystemPrompts.ts` that centralises both prompts and adds the counterfactual reasoning rules to `NEW_SYSTEM_PROMPT`.

**Tech Stack:** TypeScript, existing parser types (`IMajorCooldownInfo`, `IPlayerCCTrinketSummary`, `IEnemyCDTimeline`). No new dependencies.

---

## File Map

| Status | File                                                                    | Change                                                                                                               |
| ------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Create | `packages/shared/src/prompts/analyzeSystemPrompts.ts`                   | Single source of truth for `SYSTEM_PROMPT` and `NEW_SYSTEM_PROMPT` (with new counterfactual rules)                   |
| Modify | `packages/web/pages/api/analyze.ts`                                     | Import from shared prompts (placeholder import already present, file just missing)                                   |
| Modify | `packages/tools/src/printMatchPrompts.ts`                               | Import `SYSTEM_PROMPT` + `NEW_SYSTEM_PROMPT` from shared; keep `TEST_SYSTEM_PROMPT` and `HYBRID_SYSTEM_PROMPT` local |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` | Add `buildResourceSnapshot()`, wire into `buildMatchTimeline` after each CD entry                                    |

---

## Task 1: Create shared prompt file with updated NEW_SYSTEM_PROMPT

**Files:**

- Create: `packages/shared/src/prompts/analyzeSystemPrompts.ts`

- [ ] **Step 1: Create the file**

```typescript
// packages/shared/src/prompts/analyzeSystemPrompts.ts

export const SYSTEM_PROMPT = `You are an expert World of Warcraft arena PvP analyst reviewing structured match data for a player performing at Gladiator or R1 level. Your role is a constrained evaluator — not a free-form coach.

Core rules:
- Evaluate only what the data shows. Never invent events, timestamps, or spells not present in the data.
- Only reference a spell if it appears in the COOLDOWN USAGE section or you observed it cast. Never say "you should have used X" if X is not listed — it may not be in the player's build.
- Express uncertainty explicitly. Avoid "must", "always", "should have" — prefer "likely", "probably", "the log suggests", "without HP data it's unclear whether...".
- This player already plays correctly most of the time. Focus on timing, trades, and decision quality — not rule-based mistakes.
- For purge analysis: check PURGE RESPONSIBILITY before attributing missed purges. Do not blame the log owner for purges if they cannot offensive purge.
- NEVER USED on the log owner's own abilities: default to treating absence as a recording artifact. However, constrained inference is permitted when (a) a CRITICAL MOMENT is explicitly derived from that CD's absence, OR (b) pressure data shows a documented high-threat window existed while the CD was demonstrably available AND other abilities from the same category have confirmed casts in the log. In those cases, flag the absence as a potential decision gap with stated uncertainty — do not treat it as confirmed.
- NEVER USED on a teammate's ability is a real structural observation when: (a) the ability appears in the TEAMMATE COOLDOWNS section, AND (b) other abilities from that same player DO have recorded casts, AND (c) the ability's function would have been relevant to a specific identified moment in the match. If the ability might be talent-gated and no talent data is available, explicitly flag that caveat. Do not flag absence as a decision gap if build uncertainty swamps the analysis.

Your task:
The CRITICAL MOMENTS section represents the most important events in the match. Interpret them as a sequence where earlier events constrain later options — not as independent problems. Use the MATCH ARC section to understand the causal structure before evaluating individual moments. Use supporting data only to verify or refine your conclusions, not to introduce unrelated issues.

For each CRITICAL MOMENT listed in the input, evaluate the decision:
1. Was this the correct trade given the available information?
2. What was the most likely alternative decision?
3. What is the estimated impact difference between the two choices?
4. What uncertainty prevents a definitive verdict?

Output format — exactly 5 findings maximum (fewer only if fewer moments exist), ranked by estimated match impact. Most impactful first:

## Finding 1: [short title]
**What happened:** [one sentence]
**Alternative:** [the most likely correct play — one sentence]
**Impact:** [why the difference matters — specific to timing, CD value, or match outcome]
**Confidence:** [High/Medium/Low] — [one sentence on key uncertainty]

## Finding 2: ...
## Finding 3: ...

Do not add a summary, "what went well" section, or general recommendations. Output only the numbered findings.`;

export const NEW_SYSTEM_PROMPT = `You are an expert World of Warcraft arena PvP analyst reviewing raw match timeline data for a player performing at Gladiator or R1 level.

Core rules:
- Evaluate only what the data shows. Never invent events, timestamps, or spells not present in the data.
- Only reference a spell if it appears in PLAYER LOADOUT or the timeline. Never say "you should have used X" if X is not listed — it may not be in the player's build.
- Express uncertainty explicitly. Avoid "must", "always", "should have" — prefer "likely", "probably", "the log suggests", "without HP data it's unclear whether...".
- This player already plays correctly most of the time. Focus on timing, trades, and decision quality — not rule-based mistakes.
- For purge analysis: check PURGE RESPONSIBILITY before attributing missed purges. Do not blame the log owner for purges if they cannot offensive purge.
- Ability absence: if a spell appears in PLAYER LOADOUT but has no cast in the timeline, that absence is notable only when (a) another ability from the same player appears in the timeline AND (b) the absent ability's function would have been relevant to a specific identified moment. Flag absence as a potential decision gap with stated uncertainty — never treat it as confirmed.
- Teammate ability absence follows the same rule. If talent-gating is plausible, flag that caveat explicitly.

Your task:
Your goal is **resource optimization, not survival confirmation**. Do not explain how the player survived. Explain whether they spent the minimum necessary resource to survive — and if not, what that waste costs them in the next enemy burst window.

You are given a PLAYER LOADOUT (all major CDs available this match) and a MATCH TIMELINE (raw chronological events). Each [OWNER CD] and [TEAMMATE CD] event is followed by a [RESOURCES] block showing ground-truth state at that exact moment: which friendly CDs were ready or on cooldown, which enemy offensive CDs were recently active, and the CC state of every friendly player.

Identify the most important decision points yourself. Read the full timeline, build your own causal narrative about what happened and why, then evaluate the decisions that most affected match outcome.

For each decision point, apply these four mandatory checks before writing your finding:

**1. Trade Equity**
Cross-reference the [RESOURCES] enemy active line at the moment of the CD use.
- If an enemy offensive CD was active: the trade may be warranted — evaluate HP trajectory and whether a smaller tool could have covered the window instead.
- If no enemy offensive CD was active: do NOT conclude Bait if dampening > 40% (healing is severely impaired; flat damage is lethal at that point). Do NOT conclude Bait if the preceding 10s shows sustained heavy spell pressure (Chaos Bolt chains, Pyroblast casts, Greater Pyro reads). If both conditions are absent, flag as potential Bait and assess whether a smaller tool could have covered the window.

**2. Overlap Attribution**
If two or more friendly major CDs appear within 3s in the timeline, determine Primary (the CD that was correct to use) and Secondary (the redundant one), using the [RESOURCES] CC state:
- Healer is [CAST-LOCKED] (physical stun — cannot cast): the DPS defensive is Primary (correct). Any healer defensive appearing in the same window required Trinket use to break the stun — flag as potential Total Tactical Disaster: trinket burned on an already-covered window.
- Healer is free: the healer's defensive is Primary. Any DPS defensive within 3s is a Panic Click — DPS is responsible for the redundancy.
- Both are free: the player with the larger-cooldown ability should have held — they are responsible.
The finding must name who held the redundant resource and which specific ability they should have kept.

**3. Counterfactual Path**
The alternative is never "do nothing." It is always "the cheapest tool that could have covered this window."
- Use HP trajectory and CC state from [RESOURCES] to estimate whether small tools (Ignore Pain, shields, passive healing, positioning) could have bridged the 4–6s gap.
- If the only conclusion is "not using X would have caused death with no available alternative," downgrade this finding — do not include it in your Top 5. Only findings where a cheaper path plausibly existed qualify.

**4. Specific Future Consequence**
When a CD use is flagged as wasteful or redundant, scan the future timeline for the next enemy offensive CD or [DEATH] event. If that future window results in a death or a forced emergency CD, establish direct causation by naming the exact timestamp and outcome. Do not write vague consequence language ("later pressure increased" or "resources were limited"). Name what happened and when.

For each decision point you identify, evaluate:
1. Was this the correct trade given the available information?
2. What was the most likely alternative decision?
3. What is the estimated impact difference between the two choices?
4. What uncertainty prevents a definitive verdict?

Output format — exactly 5 findings maximum (fewer only if fewer meaningful decision points exist), ranked by estimated match impact. Most impactful first:

## Finding 1: [short title]
**What happened:** [one sentence]
**Alternative:** [the most likely correct play — one sentence]
**Impact:** [why the difference matters — specific to timing, CD value, or match outcome]
**Confidence:** [High/Medium/Low] — [one sentence on key uncertainty]

## Finding 2: ...
## Finding 3: ...

After your findings, add a Data Utility section:

## Data Utility

### Used — directly informed a finding
- [event type or specific event]: [how it was used]

### Present but unused
- [event type or specific event]: [why it didn't contribute]

### Missing — would have changed confidence or a finding
- [what you needed]: [which finding it would affect]

### One change
[Single most impactful prompt or data improvement you'd make]

Do not add a summary, "what went well" section, or general recommendations beyond the numbered findings and Data Utility section.`;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p packages/shared/tsconfig.json 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/prompts/analyzeSystemPrompts.ts
git commit -m "feat: add shared analyzeSystemPrompts.ts with counterfactual reasoning rules in NEW_SYSTEM_PROMPT"
```

---

## Task 2: Wire analyze.ts to import from shared prompts

**Files:**

- Modify: `packages/web/pages/api/analyze.ts`

The file already has `import { NEW_SYSTEM_PROMPT, SYSTEM_PROMPT } from '../../shared/src/prompts/analyzeSystemPrompts';` at the top (added by a prior refactor) but the source file didn't exist yet. Now that Task 1 created it, we need to remove the inline prompt definitions that were there before.

- [ ] **Step 1: Read the current state of analyze.ts**

```bash
cat packages/web/pages/api/analyze.ts
```

Confirm the import line is present and that the old inline `SYSTEM_PROMPT` and `NEW_SYSTEM_PROMPT` string constants are gone. If they are still present as inline constants, remove them — the import from Task 1 is the source of truth.

- [ ] **Step 2: Verify the build compiles**

```bash
npx tsc --noEmit -p packages/web/tsconfig.json 2>&1 | head -20
```

Expected: no errors referencing `analyzeSystemPrompts`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/pages/api/analyze.ts
git commit -m "feat: analyze.ts imports SYSTEM_PROMPT and NEW_SYSTEM_PROMPT from shared"
```

---

## Task 3: Update printMatchPrompts.ts to import from shared prompts

**Files:**

- Modify: `packages/tools/src/printMatchPrompts.ts`

`printMatchPrompts.ts` currently has inline copies of `SYSTEM_PROMPT` and `NEW_SYSTEM_PROMPT`. Replace them with imports. Keep `TEST_SYSTEM_PROMPT` (extends SYSTEM_PROMPT with meta-reflection) and `HYBRID_SYSTEM_PROMPT` (A/B test variant) as local constants since they are tool-only.

- [ ] **Step 1: Add the import at the top of the file**

Add after the existing `import Anthropic from '@anthropic-ai/sdk';` block:

```typescript
import { NEW_SYSTEM_PROMPT, SYSTEM_PROMPT } from '../../shared/src/prompts/analyzeSystemPrompts';
```

- [ ] **Step 2: Delete the inline SYSTEM_PROMPT and NEW_SYSTEM_PROMPT constants**

Remove the two large template-literal constants named `SYSTEM_PROMPT` and `NEW_SYSTEM_PROMPT` from the file. Leave `TEST_SYSTEM_PROMPT` (which references `SYSTEM_PROMPT`) and `HYBRID_SYSTEM_PROMPT` untouched — they will resolve correctly via the import.

- [ ] **Step 3: Verify lint passes**

```bash
npm run lint -w @wowarenalogs/tools 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/tools/src/printMatchPrompts.ts
git commit -m "feat: printMatchPrompts imports shared SYSTEM_PROMPT and NEW_SYSTEM_PROMPT"
```

---

## Task 4: Add buildResourceSnapshot() to utils.ts

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

Add the helper function immediately before the `buildMatchTimeline` export (after the `buildPlayerLoadout` export, around line 989). It is a module-level function, not a closure.

- [ ] **Step 1: Add the ResourceSnapshotParams interface and function**

Insert the following block between the end of `buildPlayerLoadout` and the `// ── buildMatchTimeline ─────────────────────────────────────────────────────` comment:

```typescript
// ── buildResourceSnapshot ──────────────────────────────────────────────────

interface ResourceSnapshotParams {
  timeSeconds: number;
  ownerCDs: IMajorCooldownInfo[];
  ownerName: string;
  ownerSpec: string;
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>;
  ccTrinketSummaries: IPlayerCCTrinketSummary[];
  enemyCDTimeline: IEnemyCDTimeline;
  playerIdMap?: Map<string, number>;
}

/**
 * Builds the three-line [RESOURCES] annotation injected after each [OWNER CD] /
 * [TEAMMATE CD] event. Provides Claude with ground-truth resource state at T:
 *   Line 1 — friendly CDs: which are ready, which are on cooldown with time remaining
 *   Line 2 — enemy active: offensive CDs cast in the last 30s
 *   Line 3 — CC state: each friendly player's CC status, with [CAST-LOCKED] for physical stuns
 */
function buildResourceSnapshot({
  timeSeconds,
  ownerCDs,
  ownerName,
  ownerSpec,
  teammateCDs,
  ccTrinketSummaries,
  enemyCDTimeline,
  playerIdMap,
}: ResourceSnapshotParams): string[] {
  function pid(name: string): string {
    if (!playerIdMap) return name;
    const id = playerIdMap.get(name);
    return id !== undefined ? String(id) : name;
  }

  // ── Line 1: Friendly ready / On CD ────────────────────────────────────────
  const readyNames: string[] = [];
  const onCDParts: string[] = [];

  const allFriendlyCDs: Array<{ spellName: string; cd: IMajorCooldownInfo }> = [
    ...ownerCDs.map((cd) => ({ spellName: cd.spellName, cd })),
    ...teammateCDs.flatMap(({ cds }) => cds.map((cd) => ({ spellName: cd.spellName, cd }))),
  ];

  for (const { spellName, cd } of allFriendlyCDs) {
    // Casts strictly before this timestamp (exclude the current cast being annotated)
    const priorCasts = cd.casts.filter((c) => c.timeSeconds < timeSeconds - 0.5);

    if (priorCasts.length === 0) {
      // Never used before T — available unless match just started (5s grace)
      if (timeSeconds > 5) readyNames.push(spellName);
      continue;
    }

    // For multi-charge CDs, check whether all charge slots are consumed.
    // A slot is free if its recharge completed before T.
    const charges = cd.maxChargesDetected > 1 ? cd.maxChargesDetected : 1;
    const relevantCasts = priorCasts.slice(-charges); // last N casts, one per slot
    const earliestSlotReady = relevantCasts[0].timeSeconds + cd.cooldownSeconds;

    if (earliestSlotReady <= timeSeconds + 0.5) {
      readyNames.push(spellName);
    } else {
      const remaining = Math.round(earliestSlotReady - timeSeconds);
      onCDParts.push(`${spellName} (${remaining}s)`);
    }
  }

  const friendlyLine =
    `      [RESOURCES]  Friendly ready: ${readyNames.length > 0 ? readyNames.join(', ') : '—'}` +
    ` | On CD: ${onCDParts.length > 0 ? onCDParts.join(', ') : '—'}`;

  // ── Line 2: Enemy active offensive CDs (cast in last 30s) ─────────────────
  const enemyActiveParts: string[] = [];
  for (const player of enemyCDTimeline.players) {
    for (const cd of player.offensiveCDs) {
      const agoSeconds = timeSeconds - cd.castTimeSeconds;
      if (agoSeconds >= 0 && agoSeconds <= 30) {
        enemyActiveParts.push(`${cd.spellName} (${player.specName}, cast ${Math.round(agoSeconds)}s ago)`);
      }
    }
  }
  const enemyLine =
    `                   Enemy active: ` +
    (enemyActiveParts.length > 0 ? enemyActiveParts.join(', ') : '— (no offensive CD in last 30s)');

  // ── Line 3: CC state for every friendly player ────────────────────────────
  const summaryByName = new Map(ccTrinketSummaries.map((s) => [s.playerName, s]));

  const allFriendlyPlayers: Array<{ name: string; spec: string }> = [
    { name: ownerName, spec: ownerSpec },
    ...teammateCDs.map(({ player, spec }) => ({ name: player.name, spec })),
  ];

  const ccParts: string[] = [];
  for (const { name, spec } of allFriendlyPlayers) {
    const summary = summaryByName.get(name);
    const shortSpec = spec.split(' ').at(-1) ?? spec; // "Discipline Priest" → "Priest"
    const playerLabel = `${pid(name)} (${shortSpec})`;

    const activeCC = summary?.ccInstances.find(
      (cc) => cc.atSeconds <= timeSeconds && timeSeconds < cc.atSeconds + cc.durationSeconds,
    );

    if (!activeCC) {
      ccParts.push(`${playerLabel} free`);
      continue;
    }

    const remaining = Math.round(activeCC.atSeconds + activeCC.durationSeconds - timeSeconds);
    const isStun = activeCC.drInfo?.category === 'Stun';
    const castLockTag = isStun ? ' [CAST-LOCKED]' : '';

    // If player is physically stunned but a cast appears at this timestamp,
    // they must have used their trinket to break the stun.
    const trinketUsedNow = summary?.trinketUseTimes.some((t) => Math.abs(t - timeSeconds) <= 1) ?? false;
    const trinketTag = isStun && trinketUsedNow ? ' [used trinket to break]' : '';

    ccParts.push(`${playerLabel} ${activeCC.spellName} ${remaining}s left${castLockTag}${trinketTag}`);
  }

  const ccLine = `                   CC state: ${ccParts.join(' | ')}`;

  return [friendlyLine, enemyLine, ccLine];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p packages/shared/tsconfig.json 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "feat: add buildResourceSnapshot() helper to utils.ts"
```

---

## Task 5: Wire buildResourceSnapshot into buildMatchTimeline

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` (BuildMatchTimelineParams interface)

`buildResourceSnapshot` needs `ownerSpec` which is not currently in `BuildMatchTimelineParams`. Add it.

- [ ] **Step 1: Add ownerSpec to BuildMatchTimelineParams**

Find the `BuildMatchTimelineParams` interface (around line 992) and add `ownerSpec: string;`:

```typescript
export interface BuildMatchTimelineParams {
  owner: ICombatUnit;
  ownerSpec: string; // ← add this line
  ownerCDs: IMajorCooldownInfo[];
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>;
  enemyCDTimeline: IEnemyCDTimeline;
  ccTrinketSummaries: IPlayerCCTrinketSummary[];
  dispelSummary: IDispelSummary;
  friendlyDeaths: Array<{ spec: string; name: string; atSeconds: number }>;
  enemyDeaths: Array<{ spec: string; name: string; atSeconds: number }>;
  pressureWindows: IDamageBucket[];
  healingGaps: IHealingGap[];
  friends: ICombatUnit[];
  matchStartMs: number;
  matchEndMs: number;
  isHealer: boolean;
  playerIdMap?: Map<string, number>;
  enemyIdMap?: Map<string, number>;
}
```

- [ ] **Step 2: Destructure ownerSpec inside buildMatchTimeline**

In the destructuring block at the top of `buildMatchTimeline` (around line 1021), add `ownerSpec`:

```typescript
const {
  owner,
  ownerSpec, // ← add this
  ownerCDs,
  teammateCDs,
  enemyCDTimeline,
  ccTrinketSummaries,
  dispelSummary,
  friendlyDeaths,
  enemyDeaths,
  pressureWindows,
  healingGaps,
  friends,
  matchStartMs,
  matchEndMs,
  isHealer,
  playerIdMap,
  enemyIdMap,
} = params;
```

- [ ] **Step 3: Build the shared snapshot params object**

Add a helper closure near the top of `buildMatchTimeline` (after `enemyPid` is defined, before `addEntry`):

```typescript
/** Builds [RESOURCES] snapshot lines for a given timestamp. */
function resourceSnapshot(timeSeconds: number): string[] {
  return buildResourceSnapshot({
    timeSeconds,
    ownerCDs,
    ownerName: owner.name,
    ownerSpec,
    teammateCDs,
    ccTrinketSummaries,
    enemyCDTimeline,
    playerIdMap,
  });
}
```

- [ ] **Step 4: Inject snapshot after [OWNER CD] entries**

Find the `[OWNER CD]` block (around line 1103):

```typescript
// BEFORE:
for (const cd of ownerCDs) {
  for (const cast of cd.casts) {
    const targetPart =
      cast.targetName !== undefined
        ? ` → ${pid(cast.targetName)}${cast.targetHpPct !== undefined ? ` (${cast.targetHpPct}% HP)` : ''}`
        : '';
    addEntry(cast.timeSeconds, `${fmtTime(cast.timeSeconds)}  [OWNER CD]   ${cd.spellName}${targetPart}`);
  }
}

// AFTER:
for (const cd of ownerCDs) {
  for (const cast of cd.casts) {
    const targetPart =
      cast.targetName !== undefined
        ? ` → ${pid(cast.targetName)}${cast.targetHpPct !== undefined ? ` (${cast.targetHpPct}% HP)` : ''}`
        : '';
    addEntry(
      cast.timeSeconds,
      `${fmtTime(cast.timeSeconds)}  [OWNER CD]   ${cd.spellName}${targetPart}`,
      ...resourceSnapshot(cast.timeSeconds),
    );
  }
}
```

- [ ] **Step 5: Inject snapshot after [TEAMMATE CD] entries**

Find the `[TEAMMATE CD]` block (around line 1142):

```typescript
// BEFORE:
for (const { player, spec, cds } of teammateCDs) {
  for (const cd of cds) {
    for (const cast of cd.casts) {
      addEntry(
        cast.timeSeconds,
        `${fmtTime(cast.timeSeconds)}  [TEAMMATE CD]   ${pid(player.name)} (${spec}): ${cd.spellName}`,
      );
    }
  }
}

// AFTER:
for (const { player, spec, cds } of teammateCDs) {
  for (const cd of cds) {
    for (const cast of cd.casts) {
      addEntry(
        cast.timeSeconds,
        `${fmtTime(cast.timeSeconds)}  [TEAMMATE CD]   ${pid(player.name)} (${spec}): ${cd.spellName}`,
        ...resourceSnapshot(cast.timeSeconds),
      );
    }
  }
}
```

- [ ] **Step 6: Fix the two call sites that pass BuildMatchTimelineParams**

`buildMatchTimeline` is called in two places. Both need `ownerSpec` added.

**In `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`:**

Find the `buildMatchTimeline(params)` call and add `ownerSpec` to the params object. Search for the `BuildMatchTimelineParams` object being constructed — it will be near where `buildPlayerLoadout` is called. Add:

```typescript
ownerSpec,  // already computed earlier in that function as specToString(owner.spec)
```

**In `packages/tools/src/printMatchPrompts.ts`:**

Find the `buildMatchTimeline(params)` call in `buildMatchPromptNew`. Add:

```typescript
ownerSpec,  // already computed earlier in that function
```

- [ ] **Step 7: Verify TypeScript compiles across all packages**

```bash
npx tsc --noEmit -p packages/shared/tsconfig.json 2>&1 | head -20
npx tsc --noEmit -p packages/web/tsconfig.json 2>&1 | head -20
npx tsc --noEmit -p packages/tools/tsconfig.json 2>&1 | head -20
```

Expected: no errors in any package.

- [ ] **Step 8: Run lint**

```bash
npm run lint 2>&1 | tail -15
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx \
        packages/tools/src/printMatchPrompts.ts
git commit -m "feat: inject [RESOURCES] snapshot after each CD event in buildMatchTimeline"
```

---

## Task 6: End-to-end validation

Verify the full pipeline produces correctly formatted [RESOURCES] blocks and that Claude's reasoning reflects the new data.

- [ ] **Step 1: Print a raw timeline prompt and inspect [RESOURCES] blocks**

```bash
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 1 --new-prompt --healer 2>&1 | grep -A 3 "\[OWNER CD\]\|\[TEAMMATE CD\]" | head -60
```

Expected output pattern:

```
0:22  [OWNER CD]   Pain Suppression → 3 (62% HP)
      [RESOURCES]  Friendly ready: Power Infusion, Psychic Scream | On CD: —
                   Enemy active: — (no offensive CD in last 30s)
                   CC state: 1 (Priest) free | 2 (Warrior) free | 3 (Paladin) free
```

Verify:

- `[RESOURCES]` appears after every `[OWNER CD]` and `[TEAMMATE CD]` line
- `Friendly ready` lists spell names (not IDs)
- `On CD` shows time remaining in seconds
- `Enemy active` shows enemy spec name and seconds-ago
- `CC state` shows all friendly players

- [ ] **Step 2: Run a full AI analysis and confirm counterfactual reasoning appears**

```bash
ANTHROPIC_API_KEY=$(grep ANTHROPIC packages/web/.env.local | cut -d= -f2) \
  npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 1 --ai --new-prompt --healer 2>&1 | \
  grep -A 20 "## Finding 1" | head -25
```

Expected: the `Impact` field references specific timestamps and establishes a causal chain (not vague "later pressure" language). At least one finding should reference the `[RESOURCES]` data (e.g., mentioning no enemy CD was active, or naming a CC state).

- [ ] **Step 3: Final lint check**

```bash
npm run lint 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 4: Final commit**

```bash
git add -u
git commit -m "chore: resource audit analysis end-to-end validation passed"
```

---

## Self-Review

**Spec coverage:**

- ✅ `[RESOURCES]` snapshot after `[OWNER CD]` and `[TEAMMATE CD]` — Task 4 + 5
- ✅ Friendly ready/On CD state — Task 4 `buildResourceSnapshot` line 1
- ✅ Enemy active (last 30s) — Task 4 `buildResourceSnapshot` line 2
- ✅ CC state with `[CAST-LOCKED]` and `[used trinket to break]` — Task 4 `buildResourceSnapshot` line 3
- ✅ Supreme directive + 4 mandatory reasoning checks in `NEW_SYSTEM_PROMPT` — Task 1
- ✅ Extract prompts to shared file — Task 1, 2, 3
- ✅ `ownerSpec` added to `BuildMatchTimelineParams` — Task 5 Step 1
- ✅ Both `index.tsx` and `printMatchPrompts.ts` call sites updated — Task 5 Step 6

**Type consistency check:**

- `buildResourceSnapshot` is called as `resourceSnapshot(cast.timeSeconds)` inside the closure in Task 5 Step 3. The closure captures `ownerCDs`, `ownerName`, `ownerSpec`, `teammateCDs`, `ccTrinketSummaries`, `enemyCDTimeline`, `playerIdMap` — all available in `buildMatchTimeline` scope after Task 5 Step 2.
- `ResourceSnapshotParams.ownerSpec` is `string` — matches `ownerSpec` destructured from params.
- `addEntry(timeSeconds, ...lines)` — the spread `...resourceSnapshot(cast.timeSeconds)` works because `addEntry` accepts `...lines: string[]` (variadic).

**No placeholders:** All steps contain complete code.
