import { ICombatUnit } from '@wowarenalogs/parser';

import { ArenaObstacle, arenaObstacles } from '../data/arenaGeometry';

// ---------------------------------------------------------------------------
// Position interpolation
// ---------------------------------------------------------------------------

export interface IPosition {
  x: number;
  y: number;
}

/**
 * Interpolate a unit's game position at a given absolute timestamp (ms).
 * Returns null when advanced logging is absent or the timestamp is outside
 * the unit's advancedActions range.
 */
export function getUnitPositionAtTime(unit: ICombatUnit, timestampMs: number): IPosition | null {
  const actions = unit.advancedActions;
  if (actions.length === 0) return null;

  // Before first recorded action
  if (timestampMs < actions[0].timestamp) return null;
  // After last recorded action — use last known position
  if (timestampMs >= actions[actions.length - 1].timestamp) {
    const last = actions[actions.length - 1];
    return { x: last.advancedActorPositionX, y: last.advancedActorPositionY };
  }

  for (let i = 0; i < actions.length - 1; i++) {
    const curr = actions[i];
    const next = actions[i + 1];
    if (curr.timestamp <= timestampMs && next.timestamp > timestampMs) {
      const t = (timestampMs - curr.timestamp) / (next.timestamp - curr.timestamp);
      return {
        x: curr.advancedActorPositionX + (next.advancedActorPositionX - curr.advancedActorPositionX) * t,
        y: curr.advancedActorPositionY + (next.advancedActorPositionY - curr.advancedActorPositionY) * t,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 2D geometry helpers
// ---------------------------------------------------------------------------

/** Check if line segment AB intersects a circle with center C and radius r. */
function segmentIntersectsCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
}

/** Check if line segment AB intersects a convex polygon. */
function segmentIntersectsPolygon(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  vertices: [number, number][],
): boolean {
  if (vertices.length < 3) return false;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = vertices[i];
    const [qx, qy] = vertices[(i + 1) % n];
    if (segmentsIntersect(ax, ay, bx, by, px, py, qx, qy)) return true;
  }
  // Check if either endpoint is inside the polygon
  return pointInPolygon(ax, ay, vertices) || pointInPolygon(bx, by, vertices);
}

function cross2D(ux: number, uy: number, vx: number, vy: number): number {
  return ux * vy - uy * vx;
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1 = cross2D(dx - cx, dy - cy, ax - cx, ay - cy);
  const d2 = cross2D(dx - cx, dy - cy, bx - cx, by - cy);
  const d3 = cross2D(bx - ax, by - ay, cx - ax, cy - ay);
  const d4 = cross2D(bx - ax, by - ay, dx - ax, dy - ay);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function pointInPolygon(px: number, py: number, vertices: [number, number][]): boolean {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = vertices[i];
    const [xj, yj] = vertices[j];
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function obstacleBlocksSegment(obs: ArenaObstacle, ax: number, ay: number, bx: number, by: number): boolean {
  if (obs.type === 'circle') {
    return segmentIntersectsCircle(ax, ay, bx, by, obs.cx, obs.cy, obs.r);
  } else {
    return segmentIntersectsPolygon(ax, ay, bx, by, obs.vertices);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if caster has unobstructed line of sight to target (no arena
 * obstacle intersects the line between them).
 *
 * Returns null when:
 *   - the zoneId has no geometry data (arena not yet mapped), or
 *   - either position is unavailable (no advanced logging).
 *
 * Note: this is a 2D approximation — Z-axis elevation and pillar overhangs
 * are not modelled. Accurate for standard arena play where players stay on
 * the ground level.
 */
export function hasLineOfSight(zoneId: string, casterPos: IPosition, targetPos: IPosition): boolean | null {
  const obstacles = arenaObstacles[zoneId];
  // Unknown arena or no geometry mapped yet
  if (!obstacles || obstacles.length === 0) return null;

  for (const obs of obstacles) {
    if (obstacleBlocksSegment(obs, casterPos.x, casterPos.y, targetPos.x, targetPos.y)) {
      return false;
    }
  }
  return true;
}

/**
 * Convenience: compute distance between two positions in game yards.
 */
export function distanceBetween(a: IPosition, b: IPosition): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
