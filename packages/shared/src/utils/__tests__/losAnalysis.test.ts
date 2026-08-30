/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
import { distanceBetween, getUnitPositionAtTime, hasLineOfSight } from '../losAnalysis';
import { makeAdvancedAction, makeUnit } from './testHelpers';

// ─── distanceBetween ──────────────────────────────────────────────────────────

describe('distanceBetween', () => {
  it('returns 0 for identical positions', () => {
    expect(distanceBetween({ x: 5, y: 10 }, { x: 5, y: 10 })).toBe(0);
    expect(distanceBetween({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
  });

  it('returns 5 for a 3-4-5 right triangle', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
  });

  it('returns 5 for negative coordinate 3-4-5 triangle', () => {
    expect(distanceBetween({ x: -3, y: -4 }, { x: 0, y: 0 })).toBeCloseTo(5);
  });

  it('is symmetric (a→b equals b→a)', () => {
    const a = { x: 10, y: 20 };
    const b = { x: 30, y: 40 };
    expect(distanceBetween(a, b)).toBeCloseTo(distanceBetween(b, a));
  });

  it('handles axis-aligned horizontal distance', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(10);
  });

  it('handles axis-aligned vertical distance', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 0, y: 7 })).toBeCloseTo(7);
  });

  it('handles large WoW-scale coordinates', () => {
    // Nagrand arena coordinates are in the −2000 to 6600 range
    const d = distanceBetween({ x: -2091, y: 6605 }, { x: -1998, y: 6704 });
    expect(d).toBeCloseTo(Math.sqrt(93 * 93 + 99 * 99));
  });
});

// ─── getUnitPositionAtTime ────────────────────────────────────────────────────

describe('getUnitPositionAtTime', () => {
  it('returns null for a unit with no advanced actions', () => {
    const unit = makeUnit('player-1');
    expect(getUnitPositionAtTime(unit, 5_000)).toBeNull();
  });

  it('returns null for a timestamp before the first recorded action', () => {
    const unit = makeUnit('player-1', {
      advancedActions: [makeAdvancedAction(10_000, 100, 200) as any],
    });
    expect(getUnitPositionAtTime(unit, 5_000)).toBeNull();
  });

  it('returns the last known position for a timestamp after all recorded actions', () => {
    const unit = makeUnit('player-1', {
      advancedActions: [makeAdvancedAction(10_000, 100, 200) as any, makeAdvancedAction(20_000, 150, 250) as any],
    });
    const pos = getUnitPositionAtTime(unit, 30_000);
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeCloseTo(150);
    expect(pos!.y).toBeCloseTo(250);
  });

  it('returns the exact position at the first action timestamp', () => {
    const unit = makeUnit('player-1', {
      advancedActions: [makeAdvancedAction(10_000, 100, 200) as any, makeAdvancedAction(20_000, 150, 250) as any],
    });
    const pos = getUnitPositionAtTime(unit, 10_000);
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeCloseTo(100);
    expect(pos!.y).toBeCloseTo(200);
  });

  it('interpolates linearly at the midpoint between two actions', () => {
    const unit = makeUnit('player-1', {
      advancedActions: [makeAdvancedAction(10_000, 0, 0) as any, makeAdvancedAction(20_000, 100, 200) as any],
    });
    const pos = getUnitPositionAtTime(unit, 15_000); // 50% between the two
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeCloseTo(50);
    expect(pos!.y).toBeCloseTo(100);
  });

  it('interpolates correctly at 25% between two actions', () => {
    const unit = makeUnit('player-1', {
      advancedActions: [makeAdvancedAction(10_000, 0, 0) as any, makeAdvancedAction(20_000, 100, 100) as any],
    });
    const pos = getUnitPositionAtTime(unit, 12_500); // 25% = (12500-10000)/(20000-10000)
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeCloseTo(25);
    expect(pos!.y).toBeCloseTo(25);
  });

  it('interpolates correctly at 75% between two actions', () => {
    const unit = makeUnit('player-1', {
      advancedActions: [makeAdvancedAction(10_000, 0, 0) as any, makeAdvancedAction(20_000, 100, 100) as any],
    });
    const pos = getUnitPositionAtTime(unit, 17_500); // 75%
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeCloseTo(75);
    expect(pos!.y).toBeCloseTo(75);
  });

  it('uses the correct segment when more than two actions exist', () => {
    const unit = makeUnit('player-1', {
      advancedActions: [
        makeAdvancedAction(10_000, 0, 0) as any,
        makeAdvancedAction(20_000, 100, 0) as any,
        makeAdvancedAction(30_000, 100, 100) as any,
      ],
    });
    // At 25_000 → between second (100,0) and third (100,100), 50% through → (100,50)
    const pos = getUnitPositionAtTime(unit, 25_000);
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeCloseTo(100);
    expect(pos!.y).toBeCloseTo(50);
  });

  it('returns last known position for timestamp exactly at last action', () => {
    const unit = makeUnit('player-1', {
      advancedActions: [makeAdvancedAction(10_000, 0, 0) as any, makeAdvancedAction(20_000, 100, 200) as any],
    });
    // Exactly at last action timestamp → returns last position
    const pos = getUnitPositionAtTime(unit, 20_000);
    expect(pos).not.toBeNull();
    expect(pos!.x).toBeCloseTo(100);
    expect(pos!.y).toBeCloseTo(200);
  });
});

// ─── hasLineOfSight ───────────────────────────────────────────────────────────

describe('hasLineOfSight', () => {
  // Nagrand Arena (zoneId='1505') has 4 circular pillars; see arenaGeometry.ts for coords.
  // Pillars: (-2043, 6621 r=2.5), (-2013, 6638 r=2.5), (-2039, 6683 r=2.5), (-2071, 6670 r=2.5)

  it('returns null for an unrecognised zone ID', () => {
    expect(hasLineOfSight('9999', { x: 0, y: 0 }, { x: 100, y: 0 })).toBeNull();
    expect(hasLineOfSight('', { x: 0, y: 0 }, { x: 100, y: 0 })).toBeNull();
  });

  it('returns a boolean (not null) for a known zone', () => {
    const result = hasLineOfSight('1505', { x: -2091, y: 6605 }, { x: -2091, y: 6640 });
    expect(result).not.toBeNull();
    expect(typeof result).toBe('boolean');
  });

  it('returns false when a line passes directly through a pillar center', () => {
    // North Nagrand pillar at (-2043, 6621) r=2.5.
    // Draw a vertical line through its center: from (x=-2043, y=6612) to (x=-2043, y=6630).
    const caster = { x: -2043, y: 6612 };
    const target = { x: -2043, y: 6630 };
    expect(hasLineOfSight('1505', caster, target)).toBe(false);
  });

  it('returns true for a horizontal line that clears all four Nagrand pillars', () => {
    // Pillars are clustered around x ∈ [-2071, -2013], y ∈ [6621, 6683].
    // A horizontal line at y=6610 (below the cluster) should be clear.
    const caster = { x: -2091, y: 6610 };
    const target = { x: -1998, y: 6610 };
    expect(hasLineOfSight('1505', caster, target)).toBe(true);
  });

  it('returns true for a line along the left arena edge (far from all pillars)', () => {
    // Leftmost edge at x ≈ -2091; pillars are at x ≥ -2071. Line is at x=-2091 → clear.
    const caster = { x: -2091, y: 6615 };
    const target = { x: -2091, y: 6695 };
    expect(hasLineOfSight('1505', caster, target)).toBe(true);
  });

  it('returns false for a line passing through the east pillar (-2013, 6638)', () => {
    // East pillar center at (-2013, 6638) r=2.5.
    // Vertical line through center: from (-2013, 6625) to (-2013, 6650).
    const caster = { x: -2013, y: 6625 };
    const target = { x: -2013, y: 6650 };
    expect(hasLineOfSight('1505', caster, target)).toBe(false);
  });
});
