Analyze a WoW arena combat log using AI cooldown analysis.

## Steps

1. **Find the log file** — check these locations in order:
   - If the user passed a path as `$ARGUMENTS`, use that directly
   - On Windows: `C:\Program Files (x86)\World of Warcraft\_retail_\Logs\`, `C:\Program Files\World of Warcraft\_retail_\Logs\`
   - On macOS: `~/Library/Application Support/World of Warcraft/_retail_/Logs/`
   - Also check `~/Downloads/` and `~/Documents/` for files matching `WoW Combat Log*.txt`
   - Pick the most recently modified file

2. **Check for the API key** — read `packages/web/.env.local` and extract `ANTHROPIC_API_KEY`. If missing, tell the user to add it to that file and stop.

3. **Run the analysis script**:
   ```
   node scripts/testAnalyze.mjs "<log-path>"
   ```
   The script auto-selects the best match (prefers 3v3 over Solo Shuffle, longest duration). To analyze a specific match index pass it as the second argument.

4. **Display the results** clearly, including:
   - Which match was selected and why
   - The full AI analysis output
   - A brief note on how to re-run for a different match index

## Notes
- The script is at `scripts/testAnalyze.mjs` in this repo
- It requires Node.js (runs cross-platform on macOS and Windows)
- ANTHROPIC_API_KEY must be set in `packages/web/.env.local` or as an environment variable
- Each analysis costs ~$0.01 in API credits
