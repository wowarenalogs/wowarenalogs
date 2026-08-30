# F73: JSON Situation Snapshot A/B Test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A/B test whether replacing the per-CD-event `[RES]` free-text snapshot with a structured `[SIT]` JSON object improves Claude's counterfactual reasoning quality, then document the decision in TRACKER.md.

**Architecture:** Add a parallel `buildJsonSituationSnapshot()` function (same inputs as `buildResourceSnapshot()`, structured JSON output with derived boolean fields `enemy_burst_active` and `healer_free`). Wire it into `printMatchPrompts.ts` via a `--compare-json` CLI flag that builds both prompt variants, calls Claude on each, and judges output quality. The evaluation is tools-only — no production code path changes until the winner is decided.

**Tech Stack:** TypeScript 4.6 (strict), `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`, `packages/shared/src/prompts/analyzeSystemPrompts.ts`, `packages/tools/src/printMatchPrompts.ts`, Anthropic SDK, `npm run -w @wowarenalogs/tools start:printMatchPrompts`.

---

## File Map

| File                                                                    | Change                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` | Add `isOwnerHealer?` to `ResourceSnapshotParams`; add `resourceSnapshotFn?` to `BuildMatchTimelineParams`; update internal `resourceSnapshot()` closure; add `buildJsonSituationSnapshot()` export |
| `packages/shared/src/prompts/analyzeSystemPrompts.ts`                   | Add `JSON_SYSTEM_PROMPT` export (copy of `NEW_SYSTEM_PROMPT` with `[RES]` description replaced by `[SIT]` JSON field description)                                                                  |
| `packages/tools/src/printMatchPrompts.ts`                               | Import new exports; add `buildMatchPromptJson()`; add `callClaudeJsonJudge()`; add `--compare-json` flag                                                                                           |

---

## Task 1: Extend interfaces in `utils.ts`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Add `isOwnerHealer?` to `ResourceSnapshotParams`**

  In the `ResourceSnapshotParams` interface (around line 1248), add the new optional field:

  ```typescript
  export interface ResourceSnapshotParams {
    timeSeconds: number;
    ownerCDs: IMajorCooldownInfo[];
    ownerName: string;
    ownerSpec: string;
    /** True when the log owner is a healer spec — used by buildJsonSituationSnapshot to derive healer_free. */
    isOwnerHealer?: boolean;
    teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>;
    ccTrinketSummaries: IPlayerCCTrinketSummary[];
    enemyCDTimeline: IEnemyCDTimeline;
    playerIdMap?: Map<string, number>;
  }
  ```

- [ ] **Step 2: Add `resourceSnapshotFn?` to `BuildMatchTimelineParams`**

  In the `BuildMatchTimelineParams` interface (around line 1355), add after `outgoingCCChains?`:

  ```typescript
  /**
   * Override the resource snapshot function injected after each [OWNER CD] and [TEAMMATE CD] event.
   * Defaults to buildResourceSnapshot (text format). Pass buildJsonSituationSnapshot for JSON format.
   */
  resourceSnapshotFn?: (params: ResourceSnapshotParams) => string;
  ```

- [ ] **Step 3: Thread `isOwnerHealer` and `resourceSnapshotFn` into the internal `resourceSnapshot()` closure**

  In `buildMatchTimeline()` (around line 1394), update the destructure to include the new param:

  ```typescript
  const {
    owner,
    ownerSpec,
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
    enemies,
    matchStartMs,
    matchEndMs,
    isHealer,
    playerIdMap,
    enemyIdMap,
    outgoingCCChains,
    resourceSnapshotFn, // ← add this
  } = params;
  ```

  Then replace the existing `resourceSnapshot()` closure (around line 1456):

  ```typescript
  const snapshotFn = resourceSnapshotFn ?? buildResourceSnapshot;

  function resourceSnapshot(timeSeconds: number): string {
    return snapshotFn({
      timeSeconds,
      ownerCDs,
      ownerName: owner.name,
      ownerSpec,
      isOwnerHealer: isHealer,
      teammateCDs,
      ccTrinketSummaries,
      enemyCDTimeline,
      playerIdMap,
    });
  }
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  npm run build:web 2>&1 | grep -E "error TS|utils\.ts"
  ```

  Expected: no errors mentioning `utils.ts` or `ResourceSnapshotParams`.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
  git commit -m "feat(F73): extend ResourceSnapshotParams + BuildMatchTimelineParams for pluggable snapshot fn"
  ```

---

## Task 2: Implement `buildJsonSituationSnapshot()` in `utils.ts`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Add the function after `buildResourceSnapshot()`**

  Insert the following export immediately after the closing brace of `buildResourceSnapshot()` (around line 1351):

  ```typescript
  /**
   * JSON-format alternative to buildResourceSnapshot().
   * Emits a compact [SIT] JSON object with derived boolean fields:
   *   enemy_burst_active — true when any enemy offensive CD was cast in the last 30s
   *   healer_free        — true when the team healer has no active CC
   *
   * Used for A/B testing (F73) to evaluate whether structured JSON gives
   * Claude more reliable counterfactual reasoning than the [RES] text format.
   */
  export function buildJsonSituationSnapshot({
    timeSeconds,
    ownerCDs,
    ownerName,
    isOwnerHealer = false,
    teammateCDs,
    ccTrinketSummaries,
    enemyCDTimeline,
    playerIdMap,
  }: ResourceSnapshotParams): string {
    function pid(name: string): string {
      if (!playerIdMap) return name;
      const id = playerIdMap.get(name);
      return id !== undefined ? String(id) : name;
    }

    // ── rdy / cd ────────────────────────────────────────────────────────────
    const rdy: string[] = [];
    const cd: Array<{ name: string; remaining: number }> = [];

    const allFriendlyCDs: Array<{ spellName: string; info: IMajorCooldownInfo }> = [
      ...ownerCDs.map((c) => ({ spellName: c.spellName, info: c })),
      ...teammateCDs.flatMap(({ cds }) => cds.map((c) => ({ spellName: c.spellName, info: c }))),
    ];

    for (const { spellName, info } of allFriendlyCDs) {
      const priorCasts = info.casts.filter((c) => c.timeSeconds < timeSeconds - 0.5);
      if (priorCasts.length === 0) {
        if (timeSeconds > 5) rdy.push(spellName);
        continue;
      }
      const charges = info.maxChargesDetected > 1 ? info.maxChargesDetected : 1;
      const relevantCasts = priorCasts.slice(-charges);
      const earliestSlotReady = relevantCasts[0].timeSeconds + info.cooldownSeconds;
      if (earliestSlotReady <= timeSeconds + 0.5) {
        rdy.push(spellName);
      } else {
        cd.push({ name: spellName, remaining: Math.round(earliestSlotReady - timeSeconds) });
      }
    }

    // ── enemy CDs ───────────────────────────────────────────────────────────
    const enemyCDs: Array<{ spell: string; spec: string; ago_s: number }> = [];
    for (const player of enemyCDTimeline.players) {
      for (const enemyCd of player.offensiveCDs) {
        const agoSeconds = timeSeconds - enemyCd.castTimeSeconds;
        if (agoSeconds >= 0 && agoSeconds <= 30) {
          enemyCDs.push({ spell: enemyCd.spellName, spec: player.specName, ago_s: Math.round(agoSeconds) });
        }
      }
    }

    // ── healer_free + cc ────────────────────────────────────────────────────
    const summaryByName = new Map(ccTrinketSummaries.map((s) => [s.playerName, s]));
    const allFriendlyPlayers = [{ name: ownerName }, ...teammateCDs.map(({ player }) => ({ name: player.name }))];

    const healerName = isOwnerHealer
      ? ownerName
      : teammateCDs.find(({ player }) => isHealerSpec(player.spec))?.player.name;

    const ccList: Array<{ player: string; spell: string; remaining_s: number; stun?: true; trinketed?: true }> = [];

    for (const { name } of allFriendlyPlayers) {
      const summary = summaryByName.get(name);
      const activeCC = summary?.ccInstances.find(
        (cc) => cc.atSeconds <= timeSeconds && timeSeconds < cc.atSeconds + cc.durationSeconds,
      );
      if (!activeCC) continue;

      const remaining = Math.round(activeCC.atSeconds + activeCC.durationSeconds - timeSeconds);
      const isStun = activeCC.drInfo?.category === 'Stun';
      const trinketUsedNow = summary?.trinketUseTimes.some((t) => Math.abs(t - timeSeconds) <= 1) ?? false;

      const entry: (typeof ccList)[number] = { player: pid(name), spell: activeCC.spellName, remaining_s: remaining };
      if (isStun) entry.stun = true;
      if (isStun && trinketUsedNow) entry.trinketed = true;
      ccList.push(entry);
    }

    const healerSummary = healerName ? summaryByName.get(healerName) : undefined;
    const healerInCC =
      healerSummary?.ccInstances.some(
        (cc) => cc.atSeconds <= timeSeconds && timeSeconds < cc.atSeconds + cc.durationSeconds,
      ) ?? false;

    // ── assemble ─────────────────────────────────────────────────────────────
    const sit: Record<string, unknown> = {
      rdy,
      cd,
      enemy_burst_active: enemyCDs.length > 0,
    };
    if (enemyCDs.length > 0) sit.enemy_cds = enemyCDs;
    sit.healer_free = !healerInCC;
    if (ccList.length > 0) sit.cc = ccList;

    return `      [SIT] ${JSON.stringify(sit)}`;
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npm run build:web 2>&1 | grep -E "error TS|utils\.ts"
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
  git commit -m "feat(F73): add buildJsonSituationSnapshot — structured [SIT] JSON alternative to [RES] text"
  ```

---

## Task 3: Add `JSON_SYSTEM_PROMPT` to `analyzeSystemPrompts.ts`

**Files:**

- Modify: `packages/shared/src/prompts/analyzeSystemPrompts.ts`

- [ ] **Step 1: Add the JSON system prompt export at the end of the file**

  Append to `analyzeSystemPrompts.ts` after line 129:

  ```typescript
  // ── JSON situation-object path (F73 A/B evaluation) ──────────────────────────

  export const JSON_SYSTEM_PROMPT = `You are an expert World of Warcraft arena PvP analyst reviewing raw match timeline data for a player performing at Gladiator or R1 level.
  
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
  
  You are given a PLAYER LOADOUT (all major CDs available this match) and a MATCH TIMELINE (raw chronological events). Each [OWNER CD] and [TEAMMATE CD] event is followed by a [SIT] JSON object showing ground-truth state at that exact moment. Fields: rdy = array of friendly CD spell names that are ready now; cd = array of {name, remaining} objects for CDs on cooldown with seconds remaining; enemy_burst_active = boolean (true when any enemy offensive CD was cast in the last 30s); enemy_cds = array of {spell, spec, ago_s} present only when enemy_burst_active is true; healer_free = boolean (true when the team healer has no active CC); cc = array of {player, spell, remaining_s, stun?, trinketed?} for each CC'd friendly, absent when all players are free. The stun field marks cast-locked physical stuns; trinketed marks PvP trinket use at this exact moment.
  
  Identify the most important decision points yourself. Read the full timeline, build your own causal narrative about what happened and why, then evaluate the decisions that most affected match outcome.
  
  For each decision point, apply these four mandatory checks before writing your finding:
  
  **1. Trade Equity**
  Read the [SIT] enemy_burst_active field at the moment of the CD use.
  - If enemy_burst_active is true: the trade may be warranted — evaluate HP trajectory and whether a smaller tool could have covered the window instead.
  - If enemy_burst_active is false: do NOT conclude Bait if dampening > 40% (healing is severely impaired; flat damage is lethal at that point). Do NOT conclude Bait if the preceding 10s shows sustained heavy spell pressure (Chaos Bolt chains, Pyroblast casts, Greater Pyro reads). If both conditions are absent, flag as potential Bait and assess whether a smaller tool could have covered the window.
  
  **2. Overlap Attribution**
  If two or more friendly major CDs appear within 3s in the timeline, determine Primary (the CD that was correct to use) and Secondary (the redundant one), using the [SIT] cc field:
  - Healer cc entry has stun: true (cast-locked by physical stun): the DPS defensive is Primary (correct). Any healer defensive appearing in the same window required Trinket use to break the stun — check for trinketed: true on the cc entry — flag as potential Total Tactical Disaster: trinket burned on an already-covered window.
  - healer_free is true: the healer's defensive is Primary. Any DPS defensive within 3s is a Panic Click — DPS is responsible for the redundancy.
  - Both are free: the player with the larger-cooldown ability should have held — they are responsible.
  The finding must name who held the redundant resource and which specific ability they should have kept.
  
  **3. Counterfactual Path**
  The alternative is never "do nothing." It is always "the cheapest tool that could have covered this window."
  - Use HP trajectory and cc field from [SIT] to estimate whether small tools (Ignore Pain, shields, passive healing, positioning) could have bridged the 4–6s gap.
  - If the only conclusion is "not using X would have caused death with no available alternative," downgrade this finding — do not include it in your Top 5. Only findings where a cheaper path plausibly existed qualify.
  
  **4. Specific Future Consequence**
  When a CD use is flagged as wasteful or redundant, scan the future timeline for the next enemy offensive CD or [DEATH] event. If that future window results in a death or a forced emergency CD, establish direct causation by naming the exact timestamp and outcome. Do not write vague consequence language ("later pressure increased" or "resources were limited"). Name what happened and when.
  
  For each decision point you identify, evaluate:
  1. Was this the correct trade given the available information?
  2. What was the most likely alternative decision?
  3. What is the estimated impact difference between the two choices?
  4. What uncertainty prevents a definitive verdict?
  
  Output constraints:
  - Generate findings only about decisions the log owner could have made differently. Use teammate actions as context within a log-owner finding — never make a teammate's decision the finding itself.
  - Do not include reasoning, self-corrections, or intermediate analysis in your output. Write only final conclusions.
  - Do not add a pre-finding analysis, summary, or ranking block. Begin directly with Finding 1.
  - Before flagging a class-specific behavior as an error, acknowledge whether it may be meta or talent-gated.
  
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
  npm run build:web 2>&1 | grep -E "error TS|analyzeSystemPrompts"
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add packages/shared/src/prompts/analyzeSystemPrompts.ts
  git commit -m "feat(F73): add JSON_SYSTEM_PROMPT for [SIT] JSON snapshot A/B evaluation"
  ```

---

## Task 4: Wire `--compare-json` into `printMatchPrompts.ts`

**Files:**

- Modify: `packages/tools/src/printMatchPrompts.ts`

- [ ] **Step 1: Add imports**

  At the top of `printMatchPrompts.ts`, extend the existing imports from `analyzeSystemPrompts`:

  ```typescript
  import { JSON_SYSTEM_PROMPT, NEW_SYSTEM_PROMPT, SYSTEM_PROMPT } from '../../shared/src/prompts/analyzeSystemPrompts';
  ```

  And extend the imports from `utils`:

  ```typescript
  import {
    buildJsonSituationSnapshot,
    buildMatchArc,
    buildMatchTimeline,
    BuildMatchTimelineParams,
    buildPlayerLoadout,
    identifyCriticalMoments,
  } from '../../shared/src/components/CombatReport/CombatAIAnalysis/utils';
  ```

- [ ] **Step 2: Add `buildMatchPromptJson()` — same as `buildMatchPromptNew()` with `resourceSnapshotFn` override**

  Add the following function immediately after `buildMatchPromptNew()` (after line 933):

  ```typescript
  function buildMatchPromptJson(combat: ParsedCombat, forceHealer = false): string {
    const allUnits = Object.values(combat.units);
    const friends = allUnits.filter(
      (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Friendly,
    ) as ICombatUnit[];
    const enemies = allUnits.filter(
      (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Hostile,
    ) as ICombatUnit[];

    if (friends.length === 0 || enemies.length === 0) return '';
    const durationSeconds = (combat.endTime - combat.startTime) / 1000;
    if (durationSeconds < 10) return '';

    const owner = forceHealer
      ? (friends.find((p) => isHealerSpec(p.spec)) ?? friends[0])
      : (friends.find((p) => !isHealerSpec(p.spec)) ?? friends.find((p) => isHealerSpec(p.spec)) ?? friends[0]);

    const ownerSpec = specToString(owner.spec);
    const isHealer = isHealerSpec(owner.spec);
    const myTeam = friends.map((p) => specToString(p.spec)).join(', ');
    const enemyTeam = enemies.map((p) => specToString(p.spec)).join(', ');

    const combatAny = combat as unknown as Record<string, unknown>;
    const playerWon =
      typeof combatAny['winningTeamId'] === 'string' ? combatAny['winningTeamId'] === combat.playerTeamId : null;
    const resultStr = playerWon === true ? 'Win' : playerWon === false ? 'Loss' : 'Unknown';

    const ownerCDs = extractMajorCooldowns(owner, combat);
    const teammateCDs = friends
      .filter((p) => p.id !== owner.id)
      .map((p) => ({ player: p, spec: specToString(p.spec), cds: extractMajorCooldowns(p, combat) }));
    const enemyCDTimeline = reconstructEnemyCDTimeline(enemies, combat, owner, friends);
    const pressureWindows = computePressureWindows(friends, combat);
    const healingGaps = isHealer ? detectHealingGaps(owner, friends, enemies, combat) : [];
    const dispelSummary = reconstructDispelSummary(friends, enemies, combat);
    const ccTrinketSummaries = friends.map((p) => analyzePlayerCCAndTrinket(p, enemies, combat));
    const outgoingCCChains = analyzeOutgoingCCChains(friends, enemies, combat);
    const ownerCanPurge = canOffensivePurge(owner);
    const teamPurgers = friends
      .filter((p) => p.id !== owner.id && canOffensivePurge(p))
      .map((p) => specToString(p.spec));

    const friendlyDeaths = friends
      .flatMap((p) =>
        p.deathRecords.map((d) => ({
          spec: specToString(p.spec),
          name: p.name,
          atSeconds: (d.timestamp - combat.startTime) / 1000,
        })),
      )
      .sort((a, b) => a.atSeconds - b.atSeconds);

    const enemyDeaths = enemies
      .flatMap((p) =>
        p.deathRecords.map((d) => ({
          spec: specToString(p.spec),
          name: p.name,
          atSeconds: (d.timestamp - combat.startTime) / 1000,
        })),
      )
      .sort((a, b) => a.atSeconds - b.atSeconds);

    const lines: string[] = [];

    lines.push('ARENA MATCH — ANALYSIS REQUEST');
    lines.push('');
    lines.push('MATCH FACTS');
    lines.push(
      `  Spec: ${ownerSpec}${isHealer ? ' (Healer)' : ''} | Bracket: ${combat.startInfo?.bracket ?? 'Unknown'} | Result: ${resultStr} | Duration: ${fmtTime(durationSeconds)}`,
    );
    lines.push(`  My team: ${myTeam}`);
    lines.push(`  Enemy team: ${enemyTeam}`);
    lines.push('');

    lines.push('PURGE RESPONSIBILITY');
    lines.push(`  Log owner (${ownerSpec}): ${ownerCanPurge ? 'CAN offensive purge' : 'CANNOT offensive purge'}`);
    lines.push(`  Team purgers: ${teamPurgers.length > 0 ? teamPurgers.join(', ') : 'none'}`);
    lines.push('');

    const specBaselineLines = formatSpecBaselines(ownerSpec, ownerCDs, benchmarks);
    if (specBaselineLines.length > 0) {
      lines.push(...specBaselineLines);
      lines.push('');
    }

    const dampeningLines = formatDampeningForContext(
      combat.startInfo?.bracket ?? '3v3',
      [...friends, ...enemies],
      combat.startTime,
      combat.endTime,
    );
    if (dampeningLines.length > 0) {
      lines.push(...dampeningLines);
      lines.push('');
    }

    const {
      text: loadoutText,
      playerIdMap,
      enemyIdMap,
    } = buildPlayerLoadout(owner, ownerSpec, ownerCDs, teammateCDs, enemyCDTimeline, enemies);
    lines.push(loadoutText);
    lines.push('');

    const params: BuildMatchTimelineParams = {
      owner,
      ownerSpec,
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
      enemies,
      matchStartMs: combat.startTime,
      matchEndMs: combat.endTime,
      isHealer,
      playerIdMap,
      enemyIdMap,
      outgoingCCChains,
      resourceSnapshotFn: buildJsonSituationSnapshot,
    };
    lines.push(buildMatchTimeline(params));

    return lines.join('\n');
  }
  ```

- [ ] **Step 3: Add `callClaudeJsonJudge()`**

  Add the following after `callClaudeJudge()` (after line 334):

  ```typescript
  async function callClaudeJsonJudge(responseA: string, responseB: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return '[AI SKIPPED — set ANTHROPIC_API_KEY env var to enable]';
    const client = new Anthropic({ apiKey });

    const judgeSystem = `You are a prompt engineer evaluating two AI-generated WoW arena match analyses produced from identical match data but different snapshot formats. Your job is to give a blunt, concrete verdict on which format produced better counterfactual reasoning. You have no stake in either approach.`;

    const userMessage = `Both analyses used the same match. Analysis A used the current [RES] free-text snapshot format. Analysis B used a new [SIT] JSON format with explicit boolean fields (enemy_burst_active, healer_free).
  
  ANALYSIS A — [RES] text format:
  ---
  ${responseA}
  ---
  
  ANALYSIS B — [SIT] JSON format:
  ---
  ${responseB}
  ---
  
  Rate each analysis on four dimensions (score 1–5 each):
  
  **Reasoning precision** — Does the model correctly apply the four counterfactual checks (Trade Equity, Overlap Attribution, Counterfactual Path, Specific Future Consequence)? Does it cite actual snapshot field values as evidence?
  **Field utilization** — Does the model demonstrate it used the snapshot data correctly? Does it distinguish enemy_burst_active=true vs false, healer_free=true vs false?
  **Actionability** — Does the output give advice the player can act on immediately in their next game?
  **Signal/noise** — Is the output free of filler, vague hedging, or padding?
  
  For each dimension, state the score for A and B and one sentence on why.
  
  Then:
  - **Winner overall:** A / B / Tie
  - **Deciding factor:** one sentence on whether the format change was responsible for any quality difference
  - **Format verdict:** one sentence on whether [SIT] JSON or [RES] text is the better primitive for Claude's counterfactual reasoning
  - **One improvement for the winner:** a concrete prompt or data change`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      temperature: 0.2,
      system: judgeSystem,
      messages: [{ role: 'user', content: userMessage }],
    });
    const content = message.content[0];
    if (content.type !== 'text') return '[Judge returned non-text response]';
    return content.text;
  }
  ```

- [ ] **Step 4: Add `compareJson` mode to `callClaude()`**

  Update the `callClaude` mode type and system prompt selection (around line 259):

  ```typescript
  async function callClaude(
    prompt: string,
    mode: 'standard' | 'test' | 'new' | 'hybrid' | 'baseline' | 'json' = 'standard',
  ): Promise<string> {
    // ...
    const systemPrompt =
      mode === 'json'
        ? JSON_SYSTEM_PROMPT
        : mode === 'hybrid'
          ? HYBRID_SYSTEM_PROMPT
          : mode === 'baseline'
            ? BASELINE_NEW_SYSTEM_PROMPT
            : mode === 'new'
              ? NEW_SYSTEM_PROMPT
              : mode === 'test'
                ? TEST_SYSTEM_PROMPT
                : SYSTEM_PROMPT;
    // ... rest unchanged
  ```

- [ ] **Step 5: Add `compareJsonMode` handling to `printMatch()`**

  Update `PrintMatchOptions` interface:

  ```typescript
  interface PrintMatchOptions {
    testPromptMode?: boolean;
    useNewPrompt?: boolean;
    compareMode?: boolean;
    compareJsonMode?: boolean;
  }
  ```

  In `printMatch()`, destructure the new option and add the `compareJsonMode` branch alongside `compareMode`:

  ```typescript
  const { testPromptMode = false, useNewPrompt = false, compareMode = false, compareJsonMode = false } = options;
  ```

  After the existing `if (compareMode)` block, add:

  ```typescript
  if (compareJsonMode) {
    process.stderr.write(
      `  JSON A/B compare for match ${matchIndex}: calling Claude x2 ([RES] text vs [SIT] JSON)...\n`,
    );
    try {
      const [responseA, responseB] = await Promise.all([callClaude(prompt, 'new'), callClaude(prompt, 'json')]);
      console.log('\n--- ANALYSIS A ([RES] text format — current) ---\n');
      console.log(responseA);
      console.log('\n--- ANALYSIS B ([SIT] JSON format — F73 candidate) ---\n');
      console.log(responseB);
      process.stderr.write(`  Calling JSON judge...\n`);
      const judgment = await callClaudeJsonJudge(responseA, responseB);
      console.log('\n--- JUDGE VERDICT ---\n');
      console.log(judgment);
    } catch (e) {
      console.log(`[Compare failed: ${e}]`);
    }
    return;
  }
  ```

  Note: `compareJsonMode` receives a JSON-built prompt as `prompt` parameter (see step 6).

- [ ] **Step 6: Add `compareJsonMode` flag to `RunOptions` and wire into `runCloud()` / `runLocal()`**

  Update `RunOptions`:

  ```typescript
  interface RunOptions {
    testPromptMode?: boolean;
    forceHealer?: boolean;
    useNewPrompt?: boolean;
    compareMode?: boolean;
    compareJsonMode?: boolean;
  }
  ```

  In `runCloud()` and `runLocal()`, extend the destructure and prompt selection:

  ```typescript
  const {
    testPromptMode = false,
    forceHealer = false,
    useNewPrompt = false,
    compareMode = false,
    compareJsonMode = false,
  } = options;
  ```

  And update the prompt selection block (currently around line 1048 in `runCloud`, similar in `runLocal`):

  ```typescript
  const prompt = compareJsonMode
    ? buildMatchPromptJson(combat, forceHealer)
    : compareMode || useNewPrompt
      ? buildMatchPromptNew(combat, forceHealer)
      : buildMatchPrompt(combat, forceHealer);
  ```

  Update the `printMatch` call to pass `compareJsonMode`:

  ```typescript
  await printMatch(label, prompt, matchCount, aiMode, { testPromptMode, useNewPrompt, compareMode, compareJsonMode });
  ```

- [ ] **Step 7: Add `--compare-json` to CLI arg parsing in `main()`**

  ```typescript
  const compareJsonMode = args.includes('--compare-json');
  ```

  Add stderr output for the new mode (after the `compareMode` block):

  ```typescript
  if (compareJsonMode) {
    if (!process.env.ANTHROPIC_API_KEY) {
      process.stderr.write('Warning: --compare-json requires ANTHROPIC_API_KEY. Responses will be skipped.\n');
    } else {
      process.stderr.write(
        'JSON compare mode — [RES] text vs [SIT] JSON, judge on counterfactual reasoning quality.\n',
      );
    }
  }
  ```

  Pass `compareJsonMode` to `runCloud` / `runLocal`:

  ```typescript
  await runCloud(count, bracket, aiMode, { testPromptMode, forceHealer, useNewPrompt, compareMode, compareJsonMode });
  // and
  await runLocal(logDir, aiMode, { testPromptMode, forceHealer, useNewPrompt, compareMode, compareJsonMode });
  ```

  Also update the usage comment at the top of the file to add the new flag:

  ```typescript
  *   npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 10 --compare-json --healer  (A/B: [RES] text vs [SIT] JSON + judge)
  ```

- [ ] **Step 8: Verify TypeScript compiles**

  ```bash
  npm run build:web 2>&1 | grep "error TS" | head -20
  ```

  Expected: no errors. Also verify the tools package:

  ```bash
  cd packages/tools && npx tsc --noEmit 2>&1 | grep "error TS" | head -20
  ```

  Expected: no errors.

- [ ] **Step 9: Commit**

  ```bash
  git add packages/tools/src/printMatchPrompts.ts
  git commit -m "feat(F73): add --compare-json CLI flag for [RES] text vs [SIT] JSON A/B test"
  ```

---

## Task 5: Run the A/B test and document the decision

**Files:**

- Modify: `TRACKER.md` (update F73 status + decision)

- [ ] **Step 1: Run 15 matches with the judge (healer perspective, since [RES] was designed for healer)**

  ```bash
  ANTHROPIC_API_KEY=<your-key> npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 15 --compare-json --healer 2>&1 | tee /tmp/f73-healer-results.txt
  ```

  Expected: 15 match blocks each with ANALYSIS A, ANALYSIS B, JUDGE VERDICT. Judge outputs winner per match.

- [ ] **Step 2: Run 5 more matches with DPS perspective**

  ```bash
  ANTHROPIC_API_KEY=<your-key> npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 5 --compare-json 2>&1 | tee /tmp/f73-dps-results.txt
  ```

- [ ] **Step 3: Tally judge verdicts**

  ```bash
  grep "Winner overall:" /tmp/f73-healer-results.txt /tmp/f73-dps-results.txt
  ```

  Count wins for A (current `[RES]` text), B (new `[SIT]` JSON), and Ties.

- [ ] **Step 4: Read the "Format verdict" lines for the judge's explicit opinion on the format question**

  ```bash
  grep "Format verdict:" /tmp/f73-healer-results.txt /tmp/f73-dps-results.txt
  ```

- [ ] **Step 5: Document findings and update TRACKER.md**

  Based on results, take one of these actions:

  **If JSON wins (B wins ≥ 60% of matches):**
  - F73 decision: migrate `buildMatchTimeline` to use JSON as default; update `NEW_SYSTEM_PROMPT` to `JSON_SYSTEM_PROMPT`; mark F73 done
  - Update TRACKER.md: change F73 status to ✅ Done with decision note
  - Move F73 to TRACKER_ARCHIVE.md

  **If text wins or Tie (A wins or ≥ 40% ties):**
  - F73 decision: keep current `[RES]` text format; the per-CD-event snapshot model is the right abstraction
  - Update TRACKER.md: change F73 status to ✅ Done with decision note
  - Move F73 to TRACKER_ARCHIVE.md

  In either case, update TRACKER.md:

  ```markdown
  | F73 | ✅ Done | [Decision: <text/json> format wins. <one sentence summary of judge verdict pattern>] | `utils.ts`, `analyzeSystemPrompts.ts` |
  ```

  Then move the row to `TRACKER_ARCHIVE.md` under the Features section.

- [ ] **Step 6: Commit the decision**

  ```bash
  git add TRACKER.md TRACKER_ARCHIVE.md
  git commit -m "chore: mark F73 complete — [RES] vs [SIT] A/B test decision: <winner>"
  ```

---

## Self-Review

**Spec coverage:**

- ✅ Implements structured JSON "situation object" with `enemy_burst_active` (bool), `healer_free` (bool), `CDs available` (rdy list)
- ✅ A/B test on 15+ matches (healer) + 5 (DPS) = 20 total
- ✅ Judge evaluates counterfactual reasoning quality specifically
- ✅ Decision is logged in TRACKER.md and F73 is archived

**Placeholder scan:** None found.

**Type consistency:**

- `ResourceSnapshotParams.isOwnerHealer?: boolean` is optional — existing callers unaffected
- `BuildMatchTimelineParams.resourceSnapshotFn?` is optional — existing call sites unaffected, default is `buildResourceSnapshot`
- `buildJsonSituationSnapshot` has identical signature to `buildResourceSnapshot` — compatible with `resourceSnapshotFn`
- `RunOptions.compareJsonMode?: boolean` is optional — existing callers unaffected
