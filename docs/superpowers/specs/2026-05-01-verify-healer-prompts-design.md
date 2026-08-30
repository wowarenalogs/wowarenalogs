# Verify Healer Prompts — Design

**Date:** 2026-05-01
**Skill:** `verify-healer-prompts` (`.claude/commands/verify-healer-prompts.md`)

## Goal

Build a corpus of 100 AI prompts from real arena matches where the logged-in
player is a healer spec, then have Claude Code (this session) review each
prompt for quality, missing features, and potential bugs. Output is a flat
findings list the user synthesizes themselves.

This is a prompt-engineering review tool, not a player-feedback tool. The
target of review is the **prompt text we send to Claude**, not the match.

## Non-goals

- Calling the Anthropic API to grade prompts (we use Claude Code per the
  user's standing preference for prompt testing).
- Categorizing or scoring findings — the user wants raw issues and will
  synthesize quality / missing-features / bug groupings themselves.
- Spec-balanced sampling — whatever the GraphQL feed returns at 3v3 / 2100+
  with a healer perspective is fine.
- Any meta-summary phase. `localBatchAnalysis.ts` already does that for
  per-match player feedback; this skill is purely prompt review.

## Architecture

Two phases, decoupled by an on-disk artifact (`index.json` + prompt files).
Phase 1 is a one-shot Node script. Phase 2 is Claude Code reading files.

```
Phase 1 (script)                     Phase 2 (Claude Code)
─────────────────                    ─────────────────────
GraphQL latestMatches  ──┐
                          │
GCS log fetch  ──────────┤── parse ──┐
                          │           │
isHealerSpec(player)  ───┘           │
                                      ↓
                        buildMatchTimeline → prompt text
                                      ↓
                        write prompts/NNN-…txt + index.json
                                      │
                                      ↓
                              ┌───────────────┐
                              │ index.json    │  ← Claude reads this
                              │ prompts/*.txt │  ← then each prompt, in order
                              └───────────────┘
                                      ↓
                              append to issues.md
```

## Phase 1 — Corpus build

**Script:** new file `packages/tools/src/buildHealerPromptCorpus.ts`,
registered as `start:buildHealerPromptCorpus` in `packages/tools/package.json`.

**Logic:**

1. Page through GraphQL `latestMatches` (bracket=3v3, MIN_RATING=2100) until
   we have 100 matches where `combat.playerId` belongs to a healer spec.
   Use existing `isHealerSpec()` from `cooldowns.ts`.
2. For each: fetch the log from GCS (public bucket
   `wowarenalogs-log-files-prod`), parse with `WoWCombatLogParser`, and
   build the prompt via the same `buildMatchTimeline` path used by
   `printMatchPrompts.ts --new-prompt`. We deliberately use the live
   prompt path so we are reviewing what production sends.
3. Write prompts to
   `packages/tools/local-batch/healer-review/prompts/<NNN>-<spec>-<W|L>-<matchId>.txt`
   where `NNN` is a zero-padded 3-digit ordinal.
4. Emit
   `packages/tools/local-batch/healer-review/index.json`:
   ```json
   [
     {
       "ordinal": 1,
       "file": "prompts/001-RestoDruid-W-abc123.txt",
       "matchId": "abc123",
       "spec": "RestoDruid",
       "bracket": "3v3",
       "result": "Win",
       "durationSec": 312
     },
     ...
   ]
   ```

**Reuse:** the GraphQL pagination, GCS fetch, and prompt-build helpers from
`printMatchPrompts.ts` — we extract the relevant pieces (or import them
directly if exported; otherwise refactor minimally to share). No new
download/parse logic.

**No AI calls in Phase 1.** The script exits when the 100th file lands.

**Caching:** out of scope for v1. Each Phase 1 run downloads fresh. If this
becomes annoying we can add log caching later (mirroring
`collectBenchmarks.ts`).

## Phase 2 — Review (Claude Code)

The skill markdown instructs Claude Code to:

1. Read `packages/tools/local-batch/healer-review/index.json`.
2. For each entry, in order:
   - Read the prompt file.
   - Evaluate it against the rubric below.
   - Append a section to
     `packages/tools/local-batch/healer-review/issues.md`:
     ```
     ## 001 — RestoDruid Win (abc123)
     - <issue>: <short description, with prompt-section/line reference>
     - <issue>: ...
     - (or "no issues" if clean)
     ```
3. Stop when done, or when context is filling — in which case note the last
   completed ordinal so the next session can resume from `ordinal+1`.

### Review rubric

**Quality**

- Is each section in the prompt focused and non-redundant?
- Are numeric facts unambiguous (units, time origin, signs)?
- Is causal context (death traces, pressure windows, dampening) actually
  load-bearing for analysis, or vestigial filler?
- Is structure consistent with `AI_FEATURES.md` ("Context Structure")?

**Missing features**

- What would a top-0.5%-rated healer want surfaced that is absent?
- Cross-reference: CC chains, dispel context, dampening, panic defensives,
  enemy CD timeline, outgoing CC chains, purge responsibility, healing
  gaps, offensive windows. If any of these is silently missing for a match
  where it would matter, flag it.

**Potential bugs**

- `undefined` / `NaN` / empty section bodies.
- Internally inconsistent timestamps (e.g., death listed before its
  contributing damage).
- Contradictions between sections (e.g., HP says alive at T, death log
  says died at T-1).
- Malformed structure: missing headers, duplicate sections, truncated
  output.
- Off-by-one indicators: HP ticks that don't line up with combat events,
  CD usage logged outside match window.

The rubric lives in the skill markdown so reviews stay consistent across
sessions / resume runs.

### Resumability

Phase 2 is idempotent per ordinal. The skill instructs Claude Code to
`grep '^## NNN ' issues.md` before reviewing ordinal N — if found, skip.
This makes resume trivial after a context reset.

## Output layout

```
packages/tools/local-batch/healer-review/
  prompts/
    001-RestoDruid-W-<id>.txt
    002-HolyPriest-L-<id>.txt
    ...
    100-…
  index.json
  issues.md         (appended; user-readable raw findings)
```

`issues.md` has no top-level summary — the user does that synthesis
themselves. The skill explicitly does not produce a quality / missing /
bugs categorization.

## Skill file

`.claude/commands/verify-healer-prompts.md` — matches the existing pattern
of `analyze-arena.md` and `collect-benchmarks.md`. Sections:

- What this does
- How to run Phase 1 (single npm command)
- How to run Phase 2 (instructions Claude Code follows)
- Review rubric (verbatim)
- Resume protocol
- Files produced

## Risks / open questions

- **Context budget.** 100 prompts at 3–6k tokens each is 300–600k tokens —
  exceeds a single context. Mitigation: Phase 2 is resumable per ordinal;
  the user is comfortable running multiple sessions.
- **Healer yield from feed.** If the 3v3 / 2100+ feed surfaces few healer
  perspectives in a window, Phase 1 may need to page further than expected.
  Acceptable for v1; we'll log a warning if pagination exceeds 500
  candidates.
- **Prompt path drift.** We use `buildMatchTimeline` (the live `--new-prompt`
  path). If production switches to a different builder later, this skill
  must update — there is no automatic detection.
