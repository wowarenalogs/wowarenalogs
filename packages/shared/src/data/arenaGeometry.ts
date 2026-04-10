/**
 * Arena obstacle geometry for line-of-sight checks.
 *
 * All coordinates are in WoW game space (same system as advancedActorPositionX/Y).
 * The arena bounds per zone are in zoneMetadata.ts for reference.
 *
 * Coordinate derivation:
 *   gameX = zone.maxX - imagePixelX / 5
 *   gameY = zone.minY + imagePixelY / 5
 *
 * Shape types:
 *   circle  — cylindrical pillar: center (cx, cy) and radius r
 *   polygon — arbitrary convex obstacle: vertices as [x, y][] in order
 *
 * Accuracy:
 *   Nagrand (1505) — validated against real position data from combat logs.
 *   All other arenas — measured from minimap images at
 *   https://images.wowarenalogs.com/minimaps/{zoneId}.png; approximate.
 *   Refine as more advanced-logging position data is collected.
 */

export type CircleObstacle = {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
};

export type PolygonObstacle = {
  type: 'polygon';
  vertices: [number, number][];
};

export type ArenaObstacle = CircleObstacle | PolygonObstacle;

/**
 * Per-zone obstacle list. Key = zoneId string (matches combat.startInfo.zoneId).
 */
export const arenaObstacles: Record<string, ArenaObstacle[]> = {
  // ---------------------------------------------------------------------------
  // Nagrand Arena — 4 cylindrical pillars arranged asymmetrically.
  // Measured from minimap image (465×495 px, 5 px/unit).
  // zone bounds: minX=-2091 maxX=-1998 minY=6605 maxY=6704
  // Recalibrated r=3.5 from TWW 11.0+ position data (12 matches, 26k samples).
  // Old r=5.5 produced violations at 2.7–4.9 units from center across all pillars —
  // players run alongside pillars at ~3.5 units from center (visual radius ~2.5–3).
  // ---------------------------------------------------------------------------
  '1505': [
    { type: 'circle', cx: -2043, cy: 6621, r: 3.5 }, // north pillar
    { type: 'circle', cx: -2013, cy: 6638, r: 3.5 }, // east pillar
    { type: 'circle', cx: -2039, cy: 6683, r: 3.5 }, // south pillar
    { type: 'circle', cx: -2071, cy: 6670, r: 3.5 }, // west pillar
  ],

  // ---------------------------------------------------------------------------
  // Blade's Edge Arena — elevated H-shaped bridge with ramp columns.
  // 505×550 px. zone bounds: minX=2732 maxX=2833 minY=5951 maxY=6061
  // Three-piece structure: top-right column, central spine, bottom-left column.
  // ---------------------------------------------------------------------------
  '1672': [
    {
      type: 'polygon',
      vertices: [
        [2774, 5962],
        [2744, 5962],
        [2744, 5985],
        [2774, 5985],
      ],
    }, // top-right column
    {
      type: 'polygon',
      vertices: [
        [2804, 5982],
        [2755, 5982],
        [2755, 6011],
        [2804, 6011],
      ],
    }, // central spine
    {
      type: 'polygon',
      vertices: [
        [2828, 6016],
        [2802, 6016],
        [2802, 6044],
        [2828, 6044],
      ],
    }, // bottom-left column
  ],

  // ---------------------------------------------------------------------------
  // Ruins of Lordaeron — large central tomb + 2 small decorative pillars.
  // 475×810 px. zone bounds: minX=1239 maxX=1334 minY=1580 maxY=1742
  // ---------------------------------------------------------------------------
  '572': [
    {
      type: 'polygon',
      vertices: [
        [1295, 1659],
        [1276, 1659],
        [1276, 1672],
        [1295, 1672],
      ],
    }, // central tomb
    {
      type: 'polygon',
      vertices: [
        [1260, 1651],
        [1255, 1651],
        [1255, 1657],
        [1260, 1657],
      ],
    }, // small pillar (east)
    {
      type: 'polygon',
      vertices: [
        [1318, 1673],
        [1315, 1673],
        [1315, 1678],
        [1318, 1678],
      ],
    }, // small pillar (west)
  ],

  // ---------------------------------------------------------------------------
  // Dalaran Sewers — 2 large rectangular stone blocks (moving platform excluded).
  // 620×460 px. zone bounds: minX=1227 maxX=1351 minY=744 maxY=836
  // ---------------------------------------------------------------------------
  '617': [
    {
      type: 'polygon',
      vertices: [
        [1315, 766],
        [1301, 766],
        [1301, 811],
        [1315, 811],
      ],
    }, // left stone block
    {
      type: 'polygon',
      vertices: [
        [1279, 766],
        [1265, 766],
        [1265, 811],
        [1279, 811],
      ],
    }, // right stone block
  ],

  // ---------------------------------------------------------------------------
  // Tiger's Peak — 2 large circular pillars (north/south) + 2 small wall segments (east/west).
  // 700×560 px. zone bounds: minX=495 maxX=635 minY=573 maxY=685
  // ---------------------------------------------------------------------------
  '1134': [
    { type: 'circle', cx: 566, cy: 601, r: 10 }, // north pillar
    { type: 'circle', cx: 567, cy: 660, r: 10 }, // south pillar
    {
      type: 'polygon',
      vertices: [
        [596, 630],
        [586, 630],
        [586, 634],
        [596, 634],
      ],
    }, // west wall segment
    {
      type: 'polygon',
      vertices: [
        [546, 630],
        [536, 630],
        [536, 634],
        [546, 634],
      ],
    }, // east wall segment
  ],

  // ---------------------------------------------------------------------------
  // Tol'Viron Arena — 1 square pillar (north) + 2 diamond pillars (south-west, south-east).
  // 635×520 px. zone bounds: minX=-10781 maxX=-10654 minY=379 maxY=483
  // ---------------------------------------------------------------------------
  '980': [
    {
      type: 'polygon',
      vertices: [
        [-10709, 396],
        [-10719, 396],
        [-10719, 403],
        [-10709, 403],
      ],
    }, // north pillar (axis-aligned square)
    {
      type: 'polygon',
      vertices: [
        [-10687, 445],
        [-10683, 449],
        [-10687, 453],
        [-10691, 449],
      ],
    }, // south-west diamond pillar
    {
      type: 'polygon',
      vertices: [
        [-10740, 445],
        [-10736, 449],
        [-10740, 453],
        [-10744, 449],
      ],
    }, // south-east diamond pillar
  ],

  // ---------------------------------------------------------------------------
  // Black Rook Hold Arena — single central circular pillar.
  // 505×480 px. zone bounds: minX=1366 maxX=1467 minY=1190 maxY=1286
  // ---------------------------------------------------------------------------
  '1504': [
    { type: 'circle', cx: 1420, cy: 1248, r: 3.5 }, // central pillar (r calibrated from position data)
  ],

  // ---------------------------------------------------------------------------
  // Ashamane's Fall — 1 rectangular stone + 2 diamond tree-root pillars.
  // 515×540 px. zone bounds: minX=3500 maxX=3603 minY=5478 maxY=5586
  // ---------------------------------------------------------------------------
  '1552': [
    {
      type: 'polygon',
      vertices: [
        [3574, 5532],
        [3566, 5532],
        [3566, 5538],
        [3574, 5538],
      ],
    }, // central stone structure
    {
      type: 'polygon',
      vertices: [
        [3524, 5515],
        [3527, 5518],
        [3524, 5521],
        [3521, 5518],
      ],
    }, // north-east diamond pillar
    {
      type: 'polygon',
      vertices: [
        [3524, 5550],
        [3527, 5553],
        [3524, 5556],
        [3521, 5553],
      ],
    }, // south-east diamond pillar
  ],

  // ---------------------------------------------------------------------------
  // Mugambala — 2 small square totems (west side) + 1 tall rectangular column (east).
  // 530×585 px. zone bounds: minX=-1994 maxX=-1888 minY=1237 maxY=1354
  // ---------------------------------------------------------------------------
  '1911': [
    {
      type: 'polygon',
      vertices: [
        [-1918, 1281],
        [-1924, 1281],
        [-1924, 1287],
        [-1918, 1287],
      ],
    }, // north-west totem
    {
      type: 'polygon',
      vertices: [
        [-1918, 1312],
        [-1924, 1312],
        [-1924, 1318],
        [-1918, 1318],
      ],
    }, // south-west totem
    {
      type: 'polygon',
      vertices: [
        [-1962, 1292],
        [-1970, 1292],
        [-1970, 1308],
        [-1962, 1308],
      ],
    }, // east tall column
  ],

  // ---------------------------------------------------------------------------
  // Hook Point — 2 small square pillars.
  // 435×385 px. zone bounds: minX=965 maxX=1052 minY=-369 maxY=-292
  // ---------------------------------------------------------------------------
  '1825': [
    {
      type: 'polygon',
      vertices: [
        [1033, -332],
        [1028, -332],
        [1028, -328],
        [1033, -328],
      ],
    }, // west pillar
    {
      type: 'polygon',
      vertices: [
        [1006, -323],
        [1001, -323],
        [1001, -319],
        [1006, -319],
      ],
    }, // east pillar
  ],

  // ---------------------------------------------------------------------------
  // The Robodrome — 2 diamond pillars (moving central platform excluded).
  // 910×480 px. zone bounds: minX=-372 maxX=-190 minY=-328 maxY=-232
  // ---------------------------------------------------------------------------
  '2167': [
    {
      type: 'polygon',
      vertices: [
        [-261, -303],
        [-257, -299],
        [-261, -295],
        [-265, -299],
      ],
    }, // west diamond pillar
    {
      type: 'polygon',
      vertices: [
        [-305, -303],
        [-301, -299],
        [-305, -295],
        [-309, -299],
      ],
    }, // east diamond pillar
  ],

  // ---------------------------------------------------------------------------
  // Empyrean Domain — 4 small diamond crystal pillars arranged in a diamond pattern.
  // 600×585 px. zone bounds: minX=-1307 maxX=-1187 minY=669 maxY=786
  // ---------------------------------------------------------------------------
  '2373': [
    {
      type: 'polygon',
      vertices: [
        [-1250, 694],
        [-1246, 698],
        [-1250, 702],
        [-1254, 698],
      ],
    }, // north crystal
    {
      type: 'polygon',
      vertices: [
        [-1220, 726],
        [-1216, 730],
        [-1220, 734],
        [-1224, 730],
      ],
    }, // east crystal
    {
      type: 'polygon',
      vertices: [
        [-1278, 726],
        [-1274, 730],
        [-1278, 734],
        [-1282, 730],
      ],
    }, // west crystal
    {
      type: 'polygon',
      vertices: [
        [-1250, 753],
        [-1246, 757],
        [-1250, 761],
        [-1254, 757],
      ],
    }, // south crystal
  ],

  // ---------------------------------------------------------------------------
  // Maldraxxus Coliseum — 3 bone/pillar obstacles (2 large, 1 smaller).
  // 605×755 px. zone bounds: minX=2772 maxX=2893 minY=2180 maxY=2331
  // ---------------------------------------------------------------------------
  '2509': [
    {
      type: 'polygon',
      vertices: [
        [2816, 2224],
        [2804, 2224],
        [2804, 2234],
        [2816, 2234],
      ],
    }, // north-east pillar
    {
      type: 'polygon',
      vertices: [
        [2869, 2249],
        [2857, 2249],
        [2857, 2260],
        [2869, 2260],
      ],
    }, // south-west pillar
    {
      type: 'polygon',
      vertices: [
        [2809, 2273],
        [2803, 2273],
        [2803, 2279],
        [2809, 2279],
      ],
    }, // south-east pillar (smaller)
  ],

  // ---------------------------------------------------------------------------
  // Enigma Crucible — 4 hexagonal crystal clusters (2 large + 2 small), modelled as circles.
  // 1055×710 px. zone bounds: minX=156 maxX=367 minY=196 maxY=338
  // Large clusters (#0, #3) reduced r=6→r=5 from TWW 11.0+ position data (edge-touching
  // violations at 4.5–5.9 units from center across ~20 matches).
  // ---------------------------------------------------------------------------
  '2547': [
    { type: 'circle', cx: 291, cy: 250, r: 5 }, // north-west cluster (large)
    { type: 'circle', cx: 255, cy: 240, r: 3 }, // north-east single
    { type: 'circle', cx: 278, cy: 293, r: 3 }, // south-west single
    { type: 'circle', cx: 241, cy: 280, r: 5 }, // south-east cluster (large)
  ],

  // ---------------------------------------------------------------------------
  // Nokhudon Proving Grounds — 2 circles + 2 small circles + 1 diagonal wall.
  // 610×550 px. zone bounds: minX=-595 maxX=-473 minY=4120 maxY=4230
  // ---------------------------------------------------------------------------
  '2563': [
    { type: 'circle', cx: -505, cy: 4149, r: 4 }, // north-west tilted pillar
    { type: 'circle', cx: -551, cy: 4150, r: 3 }, // north-east round pillar
    {
      type: 'polygon',
      vertices: [
        [-519, 4170],
        [-521, 4168],
        [-546, 4184],
        [-544, 4186],
      ],
    }, // central diagonal wall
    { type: 'circle', cx: -511, cy: 4195, r: 3 }, // south-west round pillar
    { type: 'circle', cx: -556, cy: 4199, r: 4 }, // south-east tilted pillar
  ],

  // ---------------------------------------------------------------------------
  // Cage of Carnage — real positions (TWW 11.0+ data, 9 matches) are at
  // X [401–490], Y [314–456], NOT at Empyrean Domain coords. The old geometry
  // (inherited from zone 2373) was ~1700 units wrong. Obstacles need visual
  // measurement from minimap at https://images.wowarenalogs.com/minimaps/2759.png
  // ---------------------------------------------------------------------------
  '2759': [],
};
