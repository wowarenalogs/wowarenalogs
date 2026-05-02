Build a corpus of 100 healer-perspective AI prompts and review each one for prompt-engineering quality, missing features, and bugs.

This is a **prompt review tool**, not a player-feedback tool. The target of review is the **prompt text we send to Claude**, not the player's gameplay.

## Phase 1 — Build the corpus (one shot)

Run:

```
npm run -w @wowarenalogs/tools start:buildHealerPromptCorpus
```

This pages production GraphQL `latestMatches` (3v3) until 100 matches where `combat.playerId` is a healer spec are written to:

```
packages/tools/local-batch/healer-review/
  prompts/<NNN>-<spec>-<W|L>-<matchId>.txt   # 100 files
  index.json                                  # iteration manifest
```

No AI is called in Phase 1. To shrink the corpus for development, set `TARGET_COUNT=10`. To page deeper if healers are sparse in the recent feed, raise `MAX_PAGES` (default 20).

## Phase 2 — Review (this Claude Code session)

For each entry in `index.json`, in order:

1. Determine the next ordinal to review:
   - Read `packages/tools/local-batch/healer-review/issues.md` if it exists.
   - Find the highest `## NNN` heading already present.
   - Resume from the next ordinal. If `issues.md` does not exist, start at 001.
2. Read the prompt file referenced by that index entry.
3. Evaluate it against the rubric below.
4. Append a section to `issues.md`:

   ```
   ## NNN — <spec> <Win|Loss> (<matchId>)
   - <issue>: <short description with prompt-section/line reference>
   - <issue>: ...
   - (or write "no issues" on its own bullet)
   ```
5. Repeat until either the index is exhausted or the context window is filling. If stopping early, leave `issues.md` consistent (do not write a partial section) and report which ordinal completed last so the next session resumes cleanly.

## Review rubric

Apply all three categories to every prompt. The skill output is a flat findings list — the user does the synthesis (quality / missing / bugs grouping) themselves.

**Quality**
- Is each section in the prompt focused and non-redundant?
- Are numeric facts unambiguous (units, time origin, signs)?
- Is causal context (death traces, pressure windows, dampening) actually load-bearing for analysis, or vestigial filler?
- Is the structure consistent with `AI_FEATURES.md` ("Context Structure")?

**Missing features**
- What would a top-0.5%-rated healer want surfaced that is absent?
- Cross-reference: CC chains, dispel context, dampening, panic defensives, enemy CD timeline, outgoing CC chains, purge responsibility, healing gaps, offensive windows. If any of these is silently missing for a match where it would matter, flag it.

**Potential bugs**
- `undefined` / `NaN` / empty section bodies.
- Internally inconsistent timestamps (e.g., death listed before its contributing damage).
- Contradictions between sections (e.g., HP says alive at T, death log says died at T-1).
- Malformed structure: missing headers, duplicate sections, truncated output.
- Off-by-one indicators: HP ticks that don't line up with combat events, CD usage logged outside match window.

## Files produced

- `packages/tools/local-batch/healer-review/prompts/<NNN>-<spec>-<W|L>-<matchId>.txt` — Phase 1
- `packages/tools/local-batch/healer-review/index.json` — Phase 1
- `packages/tools/local-batch/healer-review/issues.md` — Phase 2, appended

## Notes

- Use this command's Phase 2 step exclusively in Claude Code. Do not invoke the Anthropic API for review — per the user's standing preference, prompt evaluation is done in this session.
- The prompt path used is `buildMatchPromptNew` from `printMatchPrompts.ts` — the same `--new-prompt` text production analysis uses. If production switches builders, update Phase 1.
