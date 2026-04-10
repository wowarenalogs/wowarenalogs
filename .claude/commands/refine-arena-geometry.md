Validate and refine arena obstacle geometry using position data from a WoW combat log.

Reads player positions from advanced combat logging, checks them against the current geometry in `arenaGeometry.ts`, identifies violations and calibration opportunities, and proposes concrete fixes.

## Steps

### 1. Find the log file

- If `$ARGUMENTS` is provided, use that path directly.
- Otherwise check in order:
  - macOS: `~/Library/Application Support/World of Warcraft/_retail_/Logs/WoWCombatLog.txt`
  - Windows: `C:\Program Files (x86)\World of Warcraft\_retail_\Logs\WoWCombatLog.txt`
  - `~/Downloads/` and `~/Documents/` for files matching `*CombatLog*.txt`
  - Pick the most recently modified file.
- If no file is found, tell the user and stop.

### 2. Run the geometry validator

```bash
node scripts/validateGeometry.mjs "<log-path>"
```

Capture the full output. If the script errors (missing file, parse error), report it and stop.

### 3. Parse the validator output

From the output, extract for each zone:

- `zoneId` and `zoneName`
- Number of position samples
- Position X/Y range observed
- Per-obstacle: violation count and closest approach distance

Also note which zones appear in the log but have **no geometry** defined (the script silently skips them — you can check by looking at the raw log for `ARENA_MATCH_START` zone IDs not in the report).

To find all zone IDs in the log:

```bash
grep "ARENA_MATCH_START" "<log-path>" | cut -d',' -f2 | sort | uniq -c
```

### 4. Diagnose each zone

For each zone that appears in the output:

**A. Violations (positions inside an obstacle)**

- If violations > 0, investigate: are these players hugging the pillar edge (radius too large), or standing on top of an elevated platform (2D limitation)?
- Elevated platform heuristic: if the obstacle is a large rectangle (like Ruins of Lordaeron's central tomb) and violations are scattered across the footprint, it's likely an elevated walkable surface — document as 2D limitation, do NOT shrink.
- Edge-touching heuristic: if violations are clustered near the obstacle boundary (closest approach < 1 unit after violation), the radius or polygon is too large by ~0.5–1 unit. Propose shrinking.

**B. Close but clean (closest approach < 2× obstacle radius for circles)**

- This is healthy — players are hugging the pillar. No change needed.

**C. Very far closest approach (> 20 units for circles, > 15 units for polygons)**

- The obstacle may be in the wrong location. Flag for manual review.

**D. Zones with no geometry (empty `[]` in arenaGeometry.ts)**

- Read `packages/shared/src/data/arenaGeometry.ts` to confirm it's empty for these zones.
- Report the zone name, observed position bounds, and note: "needs geometry — use minimap image at https://images.wowarenalogs.com/minimaps/{zoneId}.png".

### 5. Propose and apply fixes

For each fixable issue (radius/polygon too large by edge-touching analysis):

1. State the proposed change clearly: e.g. "Black Rook Hold obstacle #0: reduce r from 4 to 3.5"
2. Edit `packages/shared/src/data/arenaGeometry.ts` to apply the fix.
3. Also update the matching entry in `scripts/validateGeometry.mjs` (it contains a mirrored copy of the obstacles for the 4 testable arenas).

Do NOT auto-fix 2D elevation violations — document them only.
Do NOT auto-fix zones with no geometry — those require visual minimap measurement.

### 6. Re-run validation to confirm

After any edits:

```bash
node scripts/validateGeometry.mjs "<log-path>"
```

Report the before/after violation counts per zone.

### 7. Report summary

Print a clear table:

```
Arena                    | Samples | Violations | Status
-------------------------|---------|------------|-------
Nagrand (1505)           |   740   |     0      | ✓ clean
Black Rook Hold (1504)   | 29,882  |     0      | ✓ fixed (r 4→3.5)
Ruins of Lordaeron (572) |   271   |    11      | ⚠ 2D elevation (tomb walkable, expected)
Tiger's Peak (1134)      |     —   |     —      | ⚪ no data in this log
...
```

Then list any zones that appeared in the log but have no geometry yet, with their position bounds.

Finally: "Run `/refine-arena-geometry` again after your next session to add more data points."

## Notes

- The validator only checks the 4 arenas that have both geometry AND test log data: Nagrand (1505), Black Rook Hold (1504), Ruins of Lordaeron (572), Tol'Viron (980). For other zones, it silently returns no results.
- The validator script is at `scripts/validateGeometry.mjs`
- Advanced combat logging must be enabled in WoW (Interface → Help → Advanced Combat Logging) for position data to exist
- Position data comes from `SPELL_CAST_SUCCESS`, `SPELL_DAMAGE`, `SPELL_HEAL`, `SPELL_PERIODIC_DAMAGE` events for confirmed arena players only (COMBATANT_INFO-registered GUIDs)
- TWW 11.0+ log format: posX at params[25] (≥30 fields). Earlier retail: posX at params[23] (~28 fields). The script handles both automatically.
- Runs of Lordaeron central tomb violations are expected (elevated walkable surface) — do not fix.
