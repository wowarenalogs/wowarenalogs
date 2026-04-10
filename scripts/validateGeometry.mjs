/**
 * Validate arena obstacle geometry against real position data from combat logs.
 *
 * For each match with advanced logging, extracts all player positions and checks:
 *  1. No position falls INSIDE an obstacle (would mean the pillar is misplaced).
 *  2. Reports minimum distance from each obstacle (sanity check that pillars are
 *     in the right area of the map).
 *
 * Usage: node scripts/validateGeometry.mjs [log-path]
 *   Defaults to all test logs in packages/parser/test/testlogs/
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Arena geometry (mirrored from arenaGeometry.ts)
// ---------------------------------------------------------------------------

const arenaObstacles = {
  1505: [
    { type: 'circle', cx: -2043, cy: 6621, r: 3.5 },
    { type: 'circle', cx: -2013, cy: 6638, r: 3.5 },
    { type: 'circle', cx: -2039, cy: 6683, r: 3.5 },
    { type: 'circle', cx: -2071, cy: 6670, r: 3.5 },
  ],
  1504: [{ type: 'circle', cx: 1420, cy: 1248, r: 3.5 }],
  572: [
    {
      type: 'polygon',
      vertices: [
        [1295, 1659],
        [1276, 1659],
        [1276, 1672],
        [1295, 1672],
      ],
    },
    {
      type: 'polygon',
      vertices: [
        [1260, 1651],
        [1255, 1651],
        [1255, 1657],
        [1260, 1657],
      ],
    },
    {
      type: 'polygon',
      vertices: [
        [1318, 1673],
        [1315, 1673],
        [1315, 1678],
        [1318, 1678],
      ],
    },
  ],
  980: [
    {
      type: 'polygon',
      vertices: [
        [-10709, 396],
        [-10719, 396],
        [-10719, 403],
        [-10709, 403],
      ],
    },
    {
      type: 'polygon',
      vertices: [
        [-10687, 445],
        [-10683, 449],
        [-10687, 453],
        [-10691, 449],
      ],
    },
    {
      type: 'polygon',
      vertices: [
        [-10740, 445],
        [-10736, 449],
        [-10740, 453],
        [-10744, 449],
      ],
    },
  ],
  1134: [
    { type: 'circle', cx: 566, cy: 601, r: 10 },
    { type: 'circle', cx: 567, cy: 660, r: 10 },
    {
      type: 'polygon',
      vertices: [
        [596, 630],
        [586, 630],
        [586, 634],
        [596, 634],
      ],
    },
    {
      type: 'polygon',
      vertices: [
        [546, 630],
        [536, 630],
        [536, 634],
        [546, 634],
      ],
    },
  ],
  1911: [
    {
      type: 'polygon',
      vertices: [
        [-1918, 1281],
        [-1924, 1281],
        [-1924, 1287],
        [-1918, 1287],
      ],
    },
    {
      type: 'polygon',
      vertices: [
        [-1918, 1312],
        [-1924, 1312],
        [-1924, 1318],
        [-1918, 1318],
      ],
    },
    {
      type: 'polygon',
      vertices: [
        [-1962, 1292],
        [-1970, 1292],
        [-1970, 1308],
        [-1962, 1308],
      ],
    },
  ],
  2509: [
    {
      type: 'polygon',
      vertices: [
        [2816, 2224],
        [2804, 2224],
        [2804, 2234],
        [2816, 2234],
      ],
    },
    {
      type: 'polygon',
      vertices: [
        [2869, 2249],
        [2857, 2249],
        [2857, 2260],
        [2869, 2260],
      ],
    },
    {
      type: 'polygon',
      vertices: [
        [2809, 2273],
        [2803, 2273],
        [2803, 2279],
        [2809, 2279],
      ],
    },
  ],
  2547: [
    { type: 'circle', cx: 291, cy: 250, r: 5 },
    { type: 'circle', cx: 255, cy: 240, r: 3 },
    { type: 'circle', cx: 278, cy: 293, r: 3 },
    { type: 'circle', cx: 241, cy: 280, r: 5 },
  ],
  2563: [
    { type: 'circle', cx: -505, cy: 4149, r: 4 },
    { type: 'circle', cx: -551, cy: 4150, r: 3 },
    {
      type: 'polygon',
      vertices: [
        [-519, 4170],
        [-521, 4168],
        [-546, 4184],
        [-544, 4186],
      ],
    },
    { type: 'circle', cx: -511, cy: 4195, r: 3 },
    { type: 'circle', cx: -556, cy: 4199, r: 4 },
  ],
  2759: [], // wrong coords inherited from zone 2373 — cleared, needs remeasurement
};

const zoneMetadata = {
  1505: { name: 'Nagrand Arena', minX: -2091, maxX: -1998, minY: 6605, maxY: 6704 },
  1504: { name: 'Black Rook Hold Arena', minX: 1366, maxX: 1467, minY: 1190, maxY: 1286 },
  572: { name: 'Ruins of Lordaeron', minX: 1239, maxX: 1334, minY: 1580, maxY: 1742 },
  980: { name: "Tol'Viron Arena", minX: -10781, maxX: -10654, minY: 379, maxY: 483 },
  1134: { name: "Tiger's Peak", minX: 495, maxX: 635, minY: 573, maxY: 685 },
  1911: { name: 'Mugambala', minX: -1994, maxX: -1888, minY: 1237, maxY: 1354 },
  2509: { name: 'Maldraxxus Coliseum', minX: 2772, maxX: 2893, minY: 2180, maxY: 2331 },
  2547: { name: 'Enigma Crucible', minX: 156, maxX: 367, minY: 196, maxY: 338 },
  2563: { name: 'Nokhudon Proving Grounds', minX: -595, maxX: -473, minY: 4120, maxY: 4230 },
  2759: { name: 'Cage of Carnage', minX: 390, maxX: 500, minY: 305, maxY: 465 }, // bounds from TWW 11.0+ data
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function distToCircle(px, py, cx, cy) {
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

function pointInPolygon(px, py, vertices) {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = vertices[i];
    const [xj, yj] = vertices[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distToPolygonCentroid(px, py, vertices) {
  const cx = vertices.reduce((s, v) => s + v[0], 0) / vertices.length;
  const cy = vertices.reduce((s, v) => s + v[1], 0) / vertices.length;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

function isInsideObstacle(px, py, obs) {
  if (obs.type === 'circle') {
    return distToCircle(px, py, obs.cx, obs.cy) < obs.r;
  } else {
    return pointInPolygon(px, py, obs.vertices);
  }
}

// ---------------------------------------------------------------------------
// Log parsing (minimal — extract positions and zone IDs)
// ---------------------------------------------------------------------------

function parseTimestamp(dateStr, timeStr) {
  const [month, day, year] = dateStr.split('/').map(Number);
  const timePart = timeStr.replace(/[+-]\d+$/, '');
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${timePart}`).getTime();
}

function parseLine(raw) {
  const tabIdx = raw.indexOf('  ');
  if (tabIdx === -1) return null;
  const datePart = raw.slice(0, tabIdx);
  const rest = raw.slice(tabIdx + 2);
  const commaIdx = rest.indexOf(',');
  if (commaIdx === -1) return null;
  const event = rest.slice(0, commaIdx);
  const paramStr = rest.slice(commaIdx + 1);
  const params = paramStr.split(',').map((s) => s.trim());
  const [date, time] = datePart.split(' ');
  const timestamp = parseTimestamp(date, time);
  return { timestamp, event, params };
}

async function parsePositionsFromLog(logPath) {
  const matches = [];
  let current = null;

  const rl = createInterface({ input: createReadStream(logPath), crlfDelay: Infinity });

  for await (const rawLine of rl) {
    const line = parseLine(rawLine.trim());
    if (!line) continue;
    const { timestamp, event, params } = line;

    if (event === 'ARENA_MATCH_START') {
      // Flush any previous unclosed match before starting new one
      if (current && current.positions.length > 0) matches.push(current);
      current = { zoneId: params[0], playerGuids: new Set(), positions: [] };
    } else if (event === 'ARENA_MATCH_END' && current) {
      matches.push(current);
      current = null;
    } else if (event === 'COMBATANT_INFO' && current) {
      // Register confirmed arena player GUIDs to filter pets/NPCs
      const guid = params[0]?.replace(/"/g, '');
      if (guid) current.playerGuids.add(guid);
    } else if (current) {
      // Only SPELL_CAST_SUCCESS / SPELL_DAMAGE / SPELL_HEAL — these have a consistent
      // 8-prefix + 3-spell-info layout, so posX is at params[23], posY at params[24].
      // (SWING_DAMAGE has no spell prefix → different offsets → skip to avoid NPC noise.)
      const spellEvents = new Set(['SPELL_CAST_SUCCESS', 'SPELL_DAMAGE', 'SPELL_HEAL', 'SPELL_PERIODIC_DAMAGE']);
      if (spellEvents.has(event) && params.length > 24) {
        const srcGuid = params[0]?.replace(/"/g, '');
        // Only track confirmed arena players
        if (srcGuid && current.playerGuids.has(srcGuid)) {
          // TWW 11.0+ (wowVersionOffset=2): posX at [25], posY at [26] — total params >= 30
          // Earlier retail format (wowVersionOffset=0): posX at [23], posY at [24] — total params ~28
          const xIdx = params.length >= 30 ? 25 : 23;
          const yIdx = xIdx + 1;
          const x = parseFloat(params[xIdx]);
          const y = parseFloat(params[yIdx]);
          if (!isNaN(x) && !isNaN(y) && x !== 0 && y !== 0) {
            current.positions.push({ x, y });
          }
        }
      }
    }
  }

  // Flush final unclosed match
  if (current && current.positions.length > 0) matches.push(current);

  return matches;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateMatch(match) {
  const { zoneId, positions } = match;
  const obstacles = arenaObstacles[zoneId];
  const meta = zoneMetadata[zoneId];

  if (!obstacles || !meta) return null;
  if (positions.length === 0) return null;

  // X/Y range
  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);
  const xMin = Math.min(...xs),
    xMax = Math.max(...xs);
  const yMin = Math.min(...ys),
    yMax = Math.max(...ys);

  const outOfBounds = positions.filter(
    (p) => p.x < meta.minX || p.x > meta.maxX || p.y < meta.minY || p.y > meta.maxY,
  ).length;

  // Per-obstacle: violations (positions inside) and closest approach
  const obsStats = obstacles.map((obs, i) => {
    const violations = positions.filter((p) => isInsideObstacle(p.x, p.y, obs));
    let minDist = Infinity;
    for (const p of positions) {
      const d =
        obs.type === 'circle' ? distToCircle(p.x, p.y, obs.cx, obs.cy) : distToPolygonCentroid(p.x, p.y, obs.vertices);
      if (d < minDist) minDist = d;
    }
    return { index: i, violations: violations.length, minDist: Math.round(minDist * 10) / 10 };
  });

  return { zoneId, zoneName: meta.name, posCount: positions.length, xMin, xMax, yMin, yMax, outOfBounds, obsStats };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const testLogDir = join(repoRoot, 'packages/parser/test/testlogs');
const logFiles = process.argv[2]
  ? [process.argv[2]]
  : [
      join(testLogDir, 'ad6c60db729c858668343bdc7d92260b_round0_reduced.txt'),
      join(testLogDir, 'one_solo_shuffle.txt'),
      join(testLogDir, 'shuffle_early_leaver.txt'),
      join(testLogDir, 'shuffle_reloads.txt'),
    ];

let totalViolations = 0;
let totalMatches = 0;

for (const logPath of logFiles) {
  console.log(`\n=== ${logPath.split('/').pop()} ===`);
  const matches = await parsePositionsFromLog(logPath);

  for (const match of matches) {
    const result = validateMatch(match);
    if (!result) continue;
    totalMatches++;

    console.log(`\n  Zone ${result.zoneId} — ${result.zoneName} (${result.posCount} position samples)`);
    console.log(
      `    Position range X: [${result.xMin.toFixed(1)}, ${result.xMax.toFixed(1)}]  Y: [${result.yMin.toFixed(1)}, ${result.yMax.toFixed(1)}]`,
    );
    if (result.outOfBounds > 0) {
      console.log(`    ⚠ ${result.outOfBounds} positions outside zone bounds`);
    }

    for (const obs of result.obsStats) {
      const label = obs.violations > 0 ? `❌ VIOLATIONS: ${obs.violations}` : '✓ clean';
      console.log(`    Obstacle #${obs.index}: ${label}  |  closest approach: ${obs.minDist} units`);
      totalViolations += obs.violations;
    }
  }
}

console.log(`\n===== Summary =====`);
console.log(`Matches validated: ${totalMatches}`);
console.log(`Total geometry violations (positions inside obstacles): ${totalViolations}`);
if (totalViolations === 0) {
  console.log('✓ All positions clear of all obstacles — geometry looks good.');
} else {
  console.log('❌ Some positions are inside obstacles — geometry needs adjustment.');
}
