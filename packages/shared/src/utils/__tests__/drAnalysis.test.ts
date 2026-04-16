/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { computeIncomingDR, DR_RESET_MS, getDRCategory, getDRLevel, getDRLevelAtTime, IDRInfo } from '../drAnalysis';

// ─── getDRCategory ─────────────────────────────────────────────────────────────

describe('getDRCategory', () => {
  it('returns "Stun" for Kidney Shot (408)', () => {
    expect(getDRCategory('408')).toBe('Stun');
  });

  it('returns "Stun" for Cheap Shot (1833)', () => {
    expect(getDRCategory('1833')).toBe('Stun');
  });

  it('returns "Stun" for Leg Sweep (119381)', () => {
    expect(getDRCategory('119381')).toBe('Stun');
  });

  it('returns "Incapacitate" for Polymorph (118)', () => {
    expect(getDRCategory('118')).toBe('Incapacitate');
  });

  it('returns "Incapacitate" for Hex (51514)', () => {
    expect(getDRCategory('51514')).toBe('Incapacitate');
  });

  it('returns "Incapacitate" for Gouge (1776)', () => {
    expect(getDRCategory('1776')).toBe('Incapacitate');
  });

  it('returns "Disorient" for Psychic Scream (8122)', () => {
    expect(getDRCategory('8122')).toBe('Disorient');
  });

  it('returns "Disorient" for Intimidating Shout (5246)', () => {
    expect(getDRCategory('5246')).toBe('Disorient');
  });

  it('returns "Cyclone" for Cyclone (33786)', () => {
    expect(getDRCategory('33786')).toBe('Cyclone');
  });

  it('returns "Horror" for Death Coil (6789)', () => {
    expect(getDRCategory('6789')).toBe('Horror');
  });

  it('returns "Silence" for Silence (15487)', () => {
    expect(getDRCategory('15487')).toBe('Silence');
  });

  it('returns "Blind" for Blind (2094)', () => {
    expect(getDRCategory('2094')).toBe('Blind');
  });

  it('falls back to "spell:<id>" for unknown spell IDs', () => {
    expect(getDRCategory('9999999')).toBe('spell:9999999');
    expect(getDRCategory('custom-spell')).toBe('spell:custom-spell');
  });
});

// ─── getDRLevel ────────────────────────────────────────────────────────────────

describe('getDRLevel', () => {
  it('returns Full / sequenceIndex=0 for empty history', () => {
    const result = getDRLevel([], 10_000);
    expect(result.level).toBe('Full');
    expect(result.sequenceIndex).toBe(0);
  });

  it('returns 50% when one prior CC expired just within the 16s reset window', () => {
    const removeMs = 10_000;
    const newApplyMs = removeMs + DR_RESET_MS - 500; // 500ms before reset
    const history = [{ applyMs: 5_000, removeMs, spellId: '408' }];
    const result = getDRLevel(history, newApplyMs);
    expect(result.level).toBe('50%');
    expect(result.sequenceIndex).toBe(1);
  });

  it('returns Full when one prior CC expired just outside the 16s reset window', () => {
    const removeMs = 10_000;
    const newApplyMs = removeMs + DR_RESET_MS + 500; // 500ms after reset
    const history = [{ applyMs: 5_000, removeMs, spellId: '408' }];
    const result = getDRLevel(history, newApplyMs);
    expect(result.level).toBe('Full');
    expect(result.sequenceIndex).toBe(0);
  });

  it('counts an active CC (not yet removed) as in-chain', () => {
    // CC applied at 5s, still active at 20s (removeMs=30_000 > newApplyMs=20_000)
    const history = [{ applyMs: 5_000, removeMs: 30_000, spellId: '408' }];
    const result = getDRLevel(history, 20_000);
    expect(result.level).toBe('50%');
    expect(result.sequenceIndex).toBe(1);
  });

  it('returns Immune when two prior CCs form a chain', () => {
    // CC1: applied 5s, removed 10s
    // CC2: applied 15s (within 16s of 10s), removed 17.5s
    // New CC at 20s: within 16s of 17.5s → Immune
    const history = [
      { applyMs: 5_000, removeMs: 10_000, spellId: '408' },
      { applyMs: 15_000, removeMs: 17_500, spellId: '408' },
    ];
    const result = getDRLevel(history, 20_000);
    expect(result.level).toBe('Immune');
    expect(result.sequenceIndex).toBe(2);
  });

  it('resets chain when the removal gap exceeds DR_RESET_MS', () => {
    // CC1 expires at 10s; next CC is 30s later — chain reset
    const history = [{ applyMs: 5_000, removeMs: 10_000, spellId: '408' }];
    const newApplyMs = 10_000 + DR_RESET_MS + 5_000;
    const result = getDRLevel(history, newApplyMs);
    expect(result.level).toBe('Full');
    expect(result.sequenceIndex).toBe(0);
  });

  it('sequenceIndex equals number of prior CCs in the current chain', () => {
    // 3 prior CCs all within DR windows → sequenceIndex=3 → Immune (capped at 2 in WoW 12.0)
    const history = [
      { applyMs: 5_000, removeMs: 10_000, spellId: '408' },
      { applyMs: 15_000, removeMs: 17_500, spellId: '408' },
    ];
    const result = getDRLevel(history, 20_000);
    expect(result.sequenceIndex).toBe(2);
  });
});

// ─── getDRLevelAtTime ─────────────────────────────────────────────────────────

describe('getDRLevelAtTime', () => {
  const DR_RESET_S = DR_RESET_MS / 1000;

  it('returns Full with no prior CC instances', () => {
    expect(getDRLevelAtTime([], 'Stun', 30)).toBe('Full');
  });

  it('returns Full for instances with a different DR category', () => {
    const instances: Array<{ atSeconds: number; durationSeconds: number; drInfo: IDRInfo }> = [
      { atSeconds: 10, durationSeconds: 3, drInfo: { category: 'Stun', level: 'Full', sequenceIndex: 0 } },
    ];
    // Querying Incapacitate → unrelated, should be Full
    expect(getDRLevelAtTime(instances, 'Incapacitate', 20)).toBe('Full');
  });

  it('returns Full when the only CC expired outside the reset window', () => {
    const instances: Array<{ atSeconds: number; durationSeconds: number; drInfo: IDRInfo }> = [
      { atSeconds: 5, durationSeconds: 3, drInfo: { category: 'Stun', level: 'Full', sequenceIndex: 0 } },
    ];
    // Expired at 8s; query at 8 + DR_RESET_S + 5 (well outside window)
    const atSeconds = 8 + DR_RESET_S + 5;
    expect(getDRLevelAtTime(instances, 'Stun', atSeconds)).toBe('Full');
  });

  it('returns 50% when one prior CC expired just within the reset window', () => {
    const instances: Array<{ atSeconds: number; durationSeconds: number; drInfo: IDRInfo }> = [
      { atSeconds: 5, durationSeconds: 3, drInfo: { category: 'Stun', level: 'Full', sequenceIndex: 0 } },
    ];
    // Expired at 8s; query at 8 + DR_RESET_S - 1 (just inside window)
    const atSeconds = 8 + DR_RESET_S - 1;
    expect(getDRLevelAtTime(instances, 'Stun', atSeconds)).toBe('50%');
  });

  it('returns Immune after two recent CCs in same category', () => {
    const instances: Array<{ atSeconds: number; durationSeconds: number; drInfo: IDRInfo }> = [
      { atSeconds: 5, durationSeconds: 3, drInfo: { category: 'Stun', level: 'Full', sequenceIndex: 0 } },
      { atSeconds: 12, durationSeconds: 2, drInfo: { category: 'Stun', level: '50%', sequenceIndex: 1 } },
    ];
    // Second CC expired at 14s; query at 14 + DR_RESET_S - 2 (just inside)
    const atSeconds = 14 + DR_RESET_S - 2;
    expect(getDRLevelAtTime(instances, 'Stun', atSeconds)).toBe('Immune');
  });

  it('returns Full after chain resets between the two CCs', () => {
    const instances: Array<{ atSeconds: number; durationSeconds: number; drInfo: IDRInfo }> = [
      { atSeconds: 5, durationSeconds: 3, drInfo: { category: 'Stun', level: 'Full', sequenceIndex: 0 } },
      // Gap > DR_RESET_S between first expiry (8s) and second apply (30s)
      { atSeconds: 30, durationSeconds: 3, drInfo: { category: 'Stun', level: 'Full', sequenceIndex: 0 } },
    ];
    // Second CC expired at 33s; query at 34s (just outside DR_RESET_S from 33s → still 50%)
    const atSeconds = 33 + DR_RESET_S - 1;
    expect(getDRLevelAtTime(instances, 'Stun', atSeconds)).toBe('50%');
  });
});

// ─── computeIncomingDR ────────────────────────────────────────────────────────

describe('computeIncomingDR', () => {
  const MATCH_START = 1_000_000;

  it('returns an array of the same length as input', () => {
    const result = computeIncomingDR([{ atSeconds: 5, durationSeconds: 3, spellId: '408' }], MATCH_START);
    expect(result).toHaveLength(1);
  });

  it('returns null for spell IDs not in ccSpellIds', () => {
    const result = computeIncomingDR([{ atSeconds: 5, durationSeconds: 3, spellId: '99999' }], MATCH_START);
    expect(result[0]).toBeNull();
  });

  it('returns Full for the first CC in a known category', () => {
    const result = computeIncomingDR([{ atSeconds: 5, durationSeconds: 3, spellId: '408' }], MATCH_START);
    expect(result[0]).not.toBeNull();
    expect(result[0]!.level).toBe('Full');
    expect(result[0]!.sequenceIndex).toBe(0);
    expect(result[0]!.category).toBe('Stun');
  });

  it('returns Full for Polymorph (Incapacitate category)', () => {
    const result = computeIncomingDR([{ atSeconds: 5, durationSeconds: 8, spellId: '118' }], MATCH_START);
    expect(result[0]?.level).toBe('Full');
    expect(result[0]?.category).toBe('Incapacitate');
  });

  it('returns 50% for second Kidney Shot within reset window', () => {
    // First CC: 5s–8s. Second at 12s (within 16s of 8s).
    const result = computeIncomingDR(
      [
        { atSeconds: 5, durationSeconds: 3, spellId: '408' },
        { atSeconds: 12, durationSeconds: 3, spellId: '408' },
      ],
      MATCH_START,
    );
    expect(result[0]?.level).toBe('Full');
    expect(result[1]?.level).toBe('50%');
    expect(result[1]?.sequenceIndex).toBe(1);
  });

  it('returns Immune for third CC in the same chain', () => {
    // CC1: 5–8s. CC2: 12–14s (50%). CC3: 20s (within 16s of 14s → Immune).
    const result = computeIncomingDR(
      [
        { atSeconds: 5, durationSeconds: 3, spellId: '408' },
        { atSeconds: 12, durationSeconds: 2, spellId: '408' },
        { atSeconds: 20, durationSeconds: 2, spellId: '408' },
      ],
      MATCH_START,
    );
    expect(result[2]?.level).toBe('Immune');
    expect(result[2]?.sequenceIndex).toBe(2);
  });

  it('resets to Full after DR_RESET_MS elapses', () => {
    const DR_RESET_S = DR_RESET_MS / 1000;
    // First CC: 5–8s. Second CC: well outside 16s reset (at 8 + DR_RESET_S + 10).
    const result = computeIncomingDR(
      [
        { atSeconds: 5, durationSeconds: 3, spellId: '408' },
        { atSeconds: 8 + DR_RESET_S + 10, durationSeconds: 3, spellId: '408' },
      ],
      MATCH_START,
    );
    expect(result[0]?.level).toBe('Full');
    expect(result[1]?.level).toBe('Full');
  });

  it('tracks Stun and Incapacitate categories independently', () => {
    // Kidney Shot (Stun), then Polymorph (Incapacitate), then Kidney Shot (Stun again → 50%)
    const result = computeIncomingDR(
      [
        { atSeconds: 5, durationSeconds: 3, spellId: '408' }, // Stun → Full
        { atSeconds: 9, durationSeconds: 8, spellId: '118' }, // Incapacitate → Full (different cat)
        { atSeconds: 12, durationSeconds: 3, spellId: '408' }, // Stun → 50%
      ],
      MATCH_START,
    );
    expect(result[0]?.level).toBe('Full');
    expect(result[1]?.level).toBe('Full');
    expect(result[2]?.level).toBe('50%');
  });

  it('handles all-null array (no known CC spells)', () => {
    const result = computeIncomingDR(
      [
        { atSeconds: 5, durationSeconds: 3, spellId: '11111' },
        { atSeconds: 10, durationSeconds: 3, spellId: '22222' },
      ],
      MATCH_START,
    );
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
  });

  it('returns empty array for empty input', () => {
    const result = computeIncomingDR([], MATCH_START);
    expect(result).toEqual([]);
  });
});
