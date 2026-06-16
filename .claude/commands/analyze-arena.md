Analyze a WoW arena combat log using AI cooldown analysis.

## How to run the analysis

**Always use Claude Code (this session) as the AI — do NOT call the Anthropic API or run `testAnalyze.mjs` directly.**

### Steps

1. **Find the log file** — check these locations in order:
   - If the user passed a path as `$ARGUMENTS`, use that directly
   - On macOS: `~/Library/Application Support/World of Warcraft/_retail_/Logs/`
   - Also check `~/Downloads/` and `~/Documents/` for files matching `WoW Combat Log*.txt`
   - Pick the most recently modified file

2. **Print the timeline prompt** (no API call):
   ```
   npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 1 --new-prompt --test-prompt --log "<log-path>"
   ```
   The script auto-selects the best match (prefers 3v3, longest duration). To target a specific match index, add `--index <N>`.

3. **Analyze the prompt inline** — take the printed timeline and analyze it yourself as Claude Code. Provide:
   - Match facts and context
   - Key decisions and their quality (timing, trade necessity, CD usage vs. pressure)
   - Top 2–3 findings with confidence levels
   - What data was missing or limited your confidence

4. **Display the analysis** clearly, including which match was selected and why.

## Notes
- The `printMatchPrompts` script is the correct tool — it uses `buildMatchTimeline` (the timeline format with `[HP]`, `[OWNER CD]`, `[ENEMY CD]`, etc.)
- The old `scripts/testAnalyze.mjs` uses a different prompt format and the Anthropic API — do not use it
- Each timeline prompt is ~3–6k tokens; Claude Code handles it fine inline
