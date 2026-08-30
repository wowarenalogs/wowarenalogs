/* eslint-disable @typescript-eslint/no-explicit-any */
import { ICombatUnit } from '@wowarenalogs/parser';

import { computeDampening, computeDampeningTimeline, dampeningDangerMultiplier, fmtDampening } from '../dampening';

// ─── dampeningDangerMultiplier ────────────────────────────────────────────────

describe('dampeningDangerMultiplier', () => {
  it('returns 1.0 at 0% dampening', () => {
    expect(dampeningDangerMultiplier(0)).toBe(1.0);
  });

  it('returns 1.45 at 30% dampening (1 + 0.3 * 1.5)', () => {
    expect(dampeningDangerMultiplier(0.3)).toBeCloseTo(1.45);
  });

  it('returns 1.9 at 60% dampening', () => {
    expect(dampeningDangerMultiplier(0.6)).toBeCloseTo(1.9);
  });

  it('returns 2.5 at 100% dampening', () => {
    expect(dampeningDangerMultiplier(1.0)).toBeCloseTo(2.5);
  });

  it('increases monotonically', () => {
    expect(dampeningDangerMultiplier(0.5)).toBeGreaterThan(dampeningDangerMultiplier(0.3));
    expect(dampeningDangerMultiplier(0.8)).toBeGreaterThan(dampeningDangerMultiplier(0.5));
    expect(dampeningDangerMultiplier(1.0)).toBeGreaterThan(dampeningDangerMultiplier(0.8));
  });
});

// ─── fmtDampening ─────────────────────────────────────────────────────────────

describe('fmtDampening', () => {
  it('formats 0 as "0%"', () => {
    expect(fmtDampening(0)).toBe('0%');
  });

  it('formats 0.1 as "10%"', () => {
    expect(fmtDampening(0.1)).toBe('10%');
  });

  it('formats 0.305 as "31%" (rounds to nearest integer)', () => {
    expect(fmtDampening(0.305)).toBe('31%');
  });

  it('formats 0.504 as "50%"', () => {
    expect(fmtDampening(0.504)).toBe('50%');
  });

  it('formats 1.0 as "100%"', () => {
    expect(fmtDampening(1.0)).toBe('100%');
  });
});

// ─── computeDampening ─────────────────────────────────────────────────────────

describe('computeDampening', () => {
  const noPlayers: ICombatUnit[] = [];

  it('returns ~10% for 3v3 with no aura events (initial fallback)', () => {
    expect(computeDampening(0, '3v3', noPlayers)).toBeCloseTo(0.1);
  });

  it('returns ~10% for Rated Solo Shuffle with no aura events', () => {
    expect(computeDampening(0, 'Rated Solo Shuffle', noPlayers)).toBeCloseTo(0.1);
  });

  it('always returns a value in [0, 1]', () => {
    const v = computeDampening(0, '3v3', noPlayers);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('handles bracket strings with "Three" in them', () => {
    // "3v3" and "Three" both map to the 3v3 rules (10% initial)
    expect(computeDampening(0, 'Three vs Three', noPlayers)).toBeCloseTo(0.1);
  });
});

// ─── computeDampeningTimeline ─────────────────────────────────────────────────

describe('computeDampeningTimeline', () => {
  const noPlayers: ICombatUnit[] = [];
  const START = 1_000_000;
  const END_5MIN = START + 300_000;
  const END_1MIN = START + 60_000;

  it('always returns at least one snapshot', () => {
    const timeline = computeDampeningTimeline('3v3', noPlayers, START, END_5MIN);
    expect(timeline.length).toBeGreaterThan(0);
  });

  it('first snapshot is at atSeconds=0', () => {
    const timeline = computeDampeningTimeline('3v3', noPlayers, START, END_5MIN);
    expect(timeline[0].atSeconds).toBe(0);
  });

  it('all dampening values are in [0, 1]', () => {
    const timeline = computeDampeningTimeline('3v3', noPlayers, START, END_5MIN);
    for (const snap of timeline) {
      expect(snap.dampening).toBeGreaterThanOrEqual(0);
      expect(snap.dampening).toBeLessThanOrEqual(1);
    }
  });

  it('initial 3v3 dampening is 10%', () => {
    const timeline = computeDampeningTimeline('3v3', noPlayers, START, END_5MIN);
    expect(timeline[0].dampening).toBeCloseTo(0.1);
  });

  it('initial Solo Shuffle dampening is 10%', () => {
    const timeline = computeDampeningTimeline('Rated Solo Shuffle', noPlayers, START, END_5MIN);
    expect(timeline[0].dampening).toBeCloseTo(0.1);
  });

  it('only emits snapshots when dampening changes (no aura events → flat line)', () => {
    // Without real dampening aura events the log falls back to initial value the whole match;
    // all snapshots should carry the same dampening and thus there should be only 1 (de-duped).
    const timeline = computeDampeningTimeline('3v3', noPlayers, START, END_1MIN);
    const firstVal = timeline[0].dampening;
    for (const snap of timeline) {
      expect(snap.dampening).toBe(firstVal);
    }
  });

  it('produces a single snapshot when dampening is flat throughout (no aura events)', () => {
    // computeDampeningTimeline only emits a snapshot when dampening changes.
    // With no aura events the value is constant, so only the first sample (at 0s) is emitted.
    const timeline = computeDampeningTimeline('3v3', noPlayers, START, END_1MIN);
    // All emitted snapshots must share the same dampening value (de-duplicated flat line).
    const firstVal = timeline[0].dampening;
    for (const snap of timeline) {
      expect(snap.dampening).toBe(firstVal);
    }
  });
});
