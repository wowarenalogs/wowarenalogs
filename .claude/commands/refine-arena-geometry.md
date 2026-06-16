Validate and refine arena obstacle geometry using position data from a WoW combat log.

Reads player positions from advanced combat logging, checks them against the current geometry in `arenaGeometry.ts`, identifies violations and calibration opportunities, and proposes concrete fixes.

## Steps

### 1. Find the log file

- If `$ARGUMENTS` is provided, use that path directly.
- Otherwise check in order:
  - macOS: `~/Library/Application Support/World of Warcraft/_retail_/Logs/WoWCombatLog.txt`
  - Windows: `C:\Program Files (x86)\World of Warcraft\_retail_\Logs\WoWCombatLog.txt`
  - `~/Downloads/` and `~/Documents/` for files matching `*CombatLog*.txt`
  - Pick the most recently modified file: `ls -t <dir>/*CombatLog*.txt 2>/dev/null | head -1`
- If no file is found, tell the user and stop.

### 2. Run the geometry validator

```bash
node scripts/validateGeometry.mjs "<log-path>"
```

Capture the full output. If the script errors (missing file, parse error), report the exact error and stop.

**Note on log format detection:** The script auto-detects TWW 11.0+ (params ≥ 30 fields → posX at [25]) vs. earlier retail (params ~28 → posX at [23]). If coordinates look clearly wrong (e.g. all positions cluster near 0,0 or outside all known zone bounds), the format heuristic may have failed — report this and do not proceed with fixes.

### 3. Parse the validator output

From the output, extract for each zone:

- `zoneId` and `zoneName`
- Number of position samples
- Position X/Y range observed
- Per-obstacle: violation count and closest approach distance

**Also check for zones with no geometry or no validation coverage:**

To find all zone IDs present in the log:

```bash
grep "ARENA_MATCH_START" "<log-path>" | cut -d',' -f2 | sort | uniq -c
```

Cross-reference against:

1. **`arenaGeometry.ts`** — zones with an empty `[]` entry (geometry stub, needs measurement)
2. **`validateGeometry.mjs`'s `arenaObstacles` object** — zones with geometry that the script can actually validate (it only validates zones present in both `arenaObstacles` AND `zoneMetadata` in the script)

As of writing, the script can validate: **1505, 1504, 572, 980, 1134, 1911, 2509, 2547, 2563, 2759** (10 zones). The following zones have geometry in `arenaGeometry.ts` but no `zoneMetadata` in the script and cannot currently be validated: **1672, 617, 1552, 1825, 2167, 2373**.

Report zones from the log that fall into each category.

### 4. Diagnose each zone

For each zone that appears in the validator output:

**A. Violations (positions inside an obstacle)**

- If violations > 0, investigate: are these players hugging the pillar edge (radius too large), or standing on top of an elevated platform (2D limitation)?
- **Elevated platform heuristic:** if the obstacle is a large rectangle (like Ruins of Lordaeron's central tomb) and violations are scattered across the footprint, it's likely an elevated walkable surface — document as 2D limitation, do NOT shrink.
- **Edge-touching heuristic:** if violations are clustered near the obstacle boundary (closest approach < 1 unit after violation), the radius or polygon is too large by ~0.5–1 unit. Propose shrinking.

**B. Close but clean (closest approach < 2× obstacle radius for circles)**

- This is healthy — players are hugging the pillar. No change needed.

**C. Suspicious closest approach**

- For **circles**: closest approach > 20 units AND > 5× the obstacle radius suggests the obstacle may be in the wrong location. Flag for manual review.
- For **polygons**: closest approach > 15 units to the centroid is only meaningful when the polygon is small (< 5 units wide). For large polygons, use your judgement. Do not auto-flag.
- **Note:** "closest approach" for polygons is reported as distance to centroid (not to the nearest edge), so it systematically overstates the true clearance for diamond/diagonal shapes. Interpret with a margin.

**D. Zones with geometry but no position samples**

No data yet — cannot validate. Note the zone name and suggest the user plays more matches with advanced logging enabled in that arena.

**E. Zones in the log with no geometry defined (empty `[]` in arenaGeometry.ts)**

- Confirm the zone has `[]` in `arenaGeometry.ts`.
- Report: zone name, observed position bounds (X range, Y range from the grep output or validator), and note: "needs geometry — verify minimap image exists at `https://images.wowarenalogs.com/minimaps/{zoneId}.png` before measuring."
- **Before referencing that URL**, confirm it returns a valid image (not 404) — new season arena IDs may not have assets served yet.

**F. Positions that are wildly out of expected range**

- If the observed X/Y range for a zone doesn't overlap at all with the `zoneMetadata` bounds, the geometry is almost certainly assigned to the wrong zone (like zone 2759's old coordinates inherited from zone 2373, which were ~1700 units off). Flag this immediately — do not compute violations or closest approach for that zone, they are meaningless. Clear the geometry entry to `[]` and document the actual observed bounds.

### 5. Propose and apply fixes

For each fixable issue (radius/polygon too large by edge-touching analysis):

1. State the proposed change clearly: e.g. "Black Rook Hold obstacle #0: reduce r from 4 to 3.5"
2. Edit **`packages/shared/src/data/arenaGeometry.ts`** to apply the fix.
3. Edit **`scripts/validateGeometry.mjs`** — it contains a hardcoded copy of the obstacles for the zones it validates. **Both files must be updated together.** If they diverge, the validator silently tests stale geometry. After editing, verify the two copies match by re-reading both the `arenaGeometry.ts` entry and the corresponding entry in `validateGeometry.mjs`.

Do NOT auto-fix 2D elevation violations — document them only.
Do NOT auto-fix zones with no geometry — those require visual minimap measurement.
Do NOT auto-fix zones where positions appear wildly out of bounds (wrong zone assignment) — clear to `[]` and document only.

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
Blade's Edge (1672)      |     —   |     —      | ⚪ not yet validatable (no zoneMetadata in script)
Cage of Carnage (2759)   |     —   |     —      | ⚠ needs geometry — minimap not confirmed
...
```

Then list:
- Zones from the log with no geometry at all, with their observed position bounds
- Zones with geometry but no validator coverage (the 6 unvalidatable zones)
- Any zones where position data looked anomalous (wrong-location warning)

Finally: "Run `/refine-arena-geometry` again after your next session to add more data points."

## Notes

### Validator coverage

The validator (`validateGeometry.mjs`) only processes zones present in **both** its `arenaObstacles` object **and** its `zoneMetadata` object. As of the last sync, these 10 zones are validatable:

| zoneId | Name |
|--------|------|
| 1505 | Nagrand Arena |
| 1504 | Black Rook Hold Arena |
| 572  | Ruins of Lordaeron |
| 980  | Tol'Viron Arena |
| 1134 | Tiger's Peak |
| 1911 | Mugambala |
| 2509 | Maldraxxus Coliseum |
| 2547 | Enigma Crucible |
| 2563 | Nokhudon Proving Grounds |
| 2759 | Cage of Carnage |

These 6 zones have geometry in `arenaGeometry.ts` but **no** validator entry — they can only be calibrated if you add `zoneMetadata` to the script for them:

| zoneId | Name |
|--------|------|
| 1672 | Blade's Edge Arena |
| 617  | Dalaran Sewers |
| 1552 | Ashamane's Fall |
| 1825 | Hook Point |
| 2167 | The Robodrome |
| 2373 | Empyrean Domain |

### Mirror-copy sync rule

`arenaGeometry.ts` and `validateGeometry.mjs` contain duplicate obstacle data. **Always edit both in the same step.** The script has no import from the TS source — if they drift, validation silently tests the wrong geometry.

### Coordinate system

```
gameX = zone.maxX - imagePixelX / 5
gameY = zone.minY + imagePixelY / 5
```

Use `zoneMetadata` bounds in the script (or `zoneMetadata.ts`) as the reference bounding box when converting minimap pixels.

### Log format

- Advanced combat logging must be enabled in WoW (Interface → Help → Advanced Combat Logging).
- TWW 11.0+ format: posX at params[25] (≥30 fields). Earlier retail: posX at params[23] (~28 fields). The script handles both automatically, but if coordinates are clearly wrong, the format heuristic may be to blame.
- Position data comes from `SPELL_CAST_SUCCESS`, `SPELL_DAMAGE`, `SPELL_HEAL`, `SPELL_PERIODIC_DAMAGE` events for confirmed arena players only (COMBATANT_INFO-registered GUIDs). `SWING_DAMAGE` is excluded — different params layout, would introduce NPC noise.

### Known expected violations

- **Ruins of Lordaeron (572) central tomb**: violations are expected and should not be fixed. The tomb is an elevated walkable surface; players can stand on top of it. The 2D geometry represents the ground-level footprint only.
