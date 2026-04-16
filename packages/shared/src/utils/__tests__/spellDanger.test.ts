import { cdTierWeight, dangerLabel, isOffensiveSpell, spellDangerWeight } from '../spellDanger';

// ─── cdTierWeight ─────────────────────────────────────────────────────────────

describe('cdTierWeight', () => {
  it('returns 0 for CDs strictly below 30s', () => {
    expect(cdTierWeight(0)).toBe(0);
    expect(cdTierWeight(1)).toBe(0);
    expect(cdTierWeight(29)).toBe(0);
  });

  it('returns 0 for exactly 30s (log(30/30) = log(1) = 0)', () => {
    expect(cdTierWeight(30)).toBe(0);
  });

  it('returns ln(2) ≈ 0.693 for 60s', () => {
    expect(cdTierWeight(60)).toBeCloseTo(Math.log(2));
  });

  it('returns ln(3) ≈ 1.099 for 90s', () => {
    expect(cdTierWeight(90)).toBeCloseTo(Math.log(3));
  });

  it('returns ln(4) ≈ 1.386 for 120s', () => {
    expect(cdTierWeight(120)).toBeCloseTo(Math.log(4));
  });

  it('returns ln(6) ≈ 1.792 for 180s', () => {
    expect(cdTierWeight(180)).toBeCloseTo(Math.log(6));
  });

  it('returns ln(10) ≈ 2.303 for 300s', () => {
    expect(cdTierWeight(300)).toBeCloseTo(Math.log(10));
  });

  it('increases monotonically with cooldown length', () => {
    expect(cdTierWeight(60)).toBeGreaterThan(cdTierWeight(30));
    expect(cdTierWeight(120)).toBeGreaterThan(cdTierWeight(60));
    expect(cdTierWeight(300)).toBeGreaterThan(cdTierWeight(180));
  });
});

// ─── dangerLabel ─────────────────────────────────────────────────────────────

describe('dangerLabel', () => {
  it('returns Low for score 0', () => {
    expect(dangerLabel(0)).toBe('Low');
  });

  it('returns Low for scores just below 2', () => {
    expect(dangerLabel(1.9)).toBe('Low');
    expect(dangerLabel(1.999)).toBe('Low');
  });

  it('returns Moderate for score exactly 2', () => {
    expect(dangerLabel(2)).toBe('Moderate');
  });

  it('returns Moderate for scores in [2, 4)', () => {
    expect(dangerLabel(2.5)).toBe('Moderate');
    expect(dangerLabel(3.99)).toBe('Moderate');
  });

  it('returns High for score exactly 4', () => {
    expect(dangerLabel(4)).toBe('High');
  });

  it('returns High for scores in [4, 7)', () => {
    expect(dangerLabel(5)).toBe('High');
    expect(dangerLabel(6.99)).toBe('High');
  });

  it('returns Critical for score exactly 7', () => {
    expect(dangerLabel(7)).toBe('Critical');
  });

  it('returns Critical for scores above 7', () => {
    expect(dangerLabel(10)).toBe('Critical');
    expect(dangerLabel(100)).toBe('Critical');
  });
});

// ─── isOffensiveSpell ─────────────────────────────────────────────────────────

describe('isOffensiveSpell', () => {
  it('returns true for Icy Veins (12472) — buffs_offensive', () => {
    expect(isOffensiveSpell('12472')).toBe(true);
  });

  it('returns true for Bestial Wrath (19574) — buffs_offensive', () => {
    expect(isOffensiveSpell('19574')).toBe(true);
  });

  it('returns true for Recklessness (1719) — buffs_offensive', () => {
    expect(isOffensiveSpell('1719')).toBe(true);
  });

  it('returns true for a debuffs_offensive spell (702)', () => {
    expect(isOffensiveSpell('702')).toBe(true);
  });

  it('returns false for Polymorph (118) — classified as cc, not offensive', () => {
    expect(isOffensiveSpell('118')).toBe(false);
  });

  it('returns false for Divine Protection (498) — defensive', () => {
    expect(isOffensiveSpell('498')).toBe(false);
  });

  it('returns false for unknown spell IDs', () => {
    expect(isOffensiveSpell('9999999')).toBe(false);
    expect(isOffensiveSpell('')).toBe(false);
  });
});

// ─── spellDangerWeight ────────────────────────────────────────────────────────

describe('spellDangerWeight', () => {
  it('returns 0 when cooldown is below 30s', () => {
    expect(spellDangerWeight('12472', 29)).toBe(0);
    expect(spellDangerWeight('1719', 0)).toBe(0);
  });

  it('applies DamageAmp (weight 1.0) for spells not in SPELL_EFFECT_OVERRIDES', () => {
    // '12472' (Icy Veins) is not in SPELL_EFFECT_OVERRIDES → defaults to DamageAmp
    const weight = spellDangerWeight('12472', 120);
    expect(weight).toBeCloseTo(Math.log(4) * 1.0);
  });

  it('applies combined DamageAmp + HealReduction for Vendetta/Deathmark (79140)', () => {
    // DamageAmp=1.0 + HealReduction=1.5 = 2.5 total effect weight
    const expected = Math.log(6) * 2.5;
    expect(spellDangerWeight('79140', 180)).toBeCloseTo(expected);
  });

  it('applies HealReduction (weight 1.5) for Mindgames (375901)', () => {
    const expected = Math.log(3) * 1.5;
    expect(spellDangerWeight('375901', 90)).toBeCloseTo(expected);
  });

  it('applies HealReduction (weight 1.5) for Soul Rot (386997)', () => {
    const expected = Math.log(3) * 1.5;
    expect(spellDangerWeight('386997', 90)).toBeCloseTo(expected);
  });

  it('applies Execution weight (0.8) for Touch of Death (115080)', () => {
    const expected = Math.log(4) * 0.8;
    expect(spellDangerWeight('115080', 120)).toBeCloseTo(expected);
  });

  it('applies Vulnerability weight (1.2) for Shadowy Duel (207736)', () => {
    const expected = Math.log(3) * 1.2;
    expect(spellDangerWeight('207736', 90)).toBeCloseTo(expected);
  });

  it('produces higher weight for longer cooldown spells of the same type', () => {
    // Same spell type (DamageAmp), 180s CD should weigh more than 60s CD
    const w60 = spellDangerWeight('12472', 60);
    const w180 = spellDangerWeight('12472', 180);
    expect(w180).toBeGreaterThan(w60);
  });
});
