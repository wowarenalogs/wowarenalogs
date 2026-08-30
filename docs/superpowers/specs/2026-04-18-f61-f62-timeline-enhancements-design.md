# F61 + F62: Timeline Enhancement — Healer Cast Log & HP Density

**Date:** 2026-04-18  
**Scope:** `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`, `__tests__/timeline.test.ts`

---

## Problem

Two gaps in the match timeline reduce Claude's analysis confidence:

1. **F61** — When a healer cast a major CD (Power Infusion, HTT, Pain Suppression, etc.) but `extractMajorCooldowns` didn't capture it (talent-filtering edge case, log artifact), the timeline has no entry. Claude cannot distinguish "never cast" from "cast but not tracked," lowering confidence on healer decision findings.

2. **F62** — HP ticks at a flat 3s interval everywhere. During kill windows, CC setups, and damage spikes, 3s resolution is too coarse for Claude to reason about reaction windows. In 4/6 LLM test rounds Claude flagged insufficient HP granularity near critical moments.

---

## F61: `[OWNER CAST]` Healer Gap-Filler

### What it does

After emitting `[OWNER CD]` entries, if `isHealer === true`, scan `owner.spellCastEvents` (SPELL_CAST_SUCCESS only) for a fixed list of important healer spell IDs. For each matching cast not already covered by an `[OWNER CD]` entry within ±1s, emit a `[OWNER CAST]` line.

### Spell ID list

```typescript
const HEALER_CAST_SPELL_ID_TO_NAME: Record<string, string> = {
  '10060': 'Power Infusion',
  '33206': 'Pain Suppression',
  '108280': 'Healing Tide Totem',
  '98008': 'Spirit Link Totem',
  '200183': 'Apotheosis',
  '265202': 'Holy Word: Salvation',
};
```

### Gap-fill deduplication

Before the healer cast loop, build a `Map<spellId, Set<roundedTimeSeconds>>` from `ownerCDs`:

```typescript
const trackedCastsBySpellId = new Map<string, Set<number>>();
for (const cd of ownerCDs) {
  trackedCastsBySpellId.set(cd.spellId, new Set(cd.casts.map((c) => Math.round(c.timeSeconds))));
}
```

For each matching `spellCastEvent`, compute `roundedT = Math.round(timeSeconds)`. Skip if `trackedSet.has(roundedT - 1) || trackedSet.has(roundedT) || trackedSet.has(roundedT + 1)`.

### Output format

```
0:34  [OWNER CAST]   Healing Tide Totem
```

No target or HP% annotation — healer spells target the team broadly and the receiving unit isn't always determinable at cast time.

### Guard

Only emitted when `isHealer === true` in `BuildMatchTimelineParams`.

### New import

`LogEvent` from `@wowarenalogs/parser` added to `utils.ts` imports.

---

## F62: Dense HP Ticks in Critical Windows

### What it does

Replace the flat 3s HP tick loop with a pre-computed tick set that uses 1s resolution inside critical windows and 3s resolution everywhere else. No duplicate ticks at window boundaries.

### Window definitions

| Event                 | Window                               |
| --------------------- | ------------------------------------ |
| `[DEATH]` (friendly)  | `[atSeconds − 10, atSeconds]`        |
| `[DMG SPIKE]` (≥300k) | `[fromSeconds − 5, fromSeconds + 5]` |
| `[CC ON TEAM]`        | `[atSeconds, atSeconds + 10]`        |

All windows clamped to `[0, matchDurationS]`.

Rationale:

- DEATH is a result — trace what led to it (lookback only)
- DMG SPIKE is centered — need both incoming and reaction window
- CC ON TEAM is setup — trace what the CC enabled (lookahead)

### Tick set algorithm

```typescript
// 1. Collect all critical window intervals
const criticalWindows: Array<[number, number]> = [];
for (const d of friendlyDeaths) {
  criticalWindows.push([Math.max(0, d.atSeconds - 10), d.atSeconds]);
}
for (const pw of pressureWindows) {
  if (pw.totalDamage >= DMG_SPIKE_THRESHOLD) {
    criticalWindows.push([Math.max(0, pw.fromSeconds - 5), Math.min(matchDurationS, pw.fromSeconds + 5)]);
  }
}
for (const summary of ccTrinketSummaries) {
  for (const cc of summary.ccInstances) {
    criticalWindows.push([cc.atSeconds, Math.min(matchDurationS, cc.atSeconds + 10)]);
  }
}

// 2. Build deduplicated tick set
const tickSet = new Set<number>();
for (let t = 0; t <= Math.ceil(matchDurationS); t++) {
  const inCriticalWindow = criticalWindows.some(([from, to]) => t >= from && t <= to);
  if (inCriticalWindow || t % 3 === 0) {
    tickSet.add(t);
  }
}

// 3. Emit ticks in order
for (const t of [...tickSet].sort((a, b) => a - b)) {
  // ... existing HP sampling logic, using t seconds
}
```

### Token impact

A typical 90s match with 2 deaths, 3 spikes, and 6 CC events adds roughly 30–50 extra HP ticks (currently ~30 ticks total → ~60–80 ticks). Acceptable given F62's target is the windows where token budget matters most for reasoning quality.

---

## Files Changed

| File               | Change                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `utils.ts`         | Add `HEALER_CAST_SPELL_ID_TO_NAME`, add `LogEvent` import, add F61 section in `buildMatchTimeline`, replace HP tick loop with F62 tick-set algorithm |
| `timeline.test.ts` | Add F61 and F62 test cases                                                                                                                           |

No changes to `BuildMatchTimelineParams` interface — all required data is already passed in.

---

## Testing

### F61

- `isHealer = true`, HTT cast by owner, NOT in `ownerCDs` → `[OWNER CAST]   Healing Tide Totem` emitted
- `isHealer = true`, PI cast by owner, IS in `ownerCDs.casts` within ±1s → `[OWNER CAST]` NOT emitted
- `isHealer = false` → no `[OWNER CAST]` entries regardless of spell casts

### F62

- DEATH at T=30: ticks at T=20,21,...,30; T=18 (3s baseline); NOT T=19
- CC ON TEAM at T=15: ticks at T=15,16,...,25; surrounding 3s ticks not duplicated
- DMG SPIKE at T=20: ticks at T=15,16,...,25; T=12 (3s baseline); NOT T=14
- Overlapping windows (DEATH at T=30, DMG SPIKE at T=26): merged — no duplicate ticks in overlap
- Outside all windows: ticks only at multiples of 3
