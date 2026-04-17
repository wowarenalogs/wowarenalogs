import { IMajorCooldownInfo } from '../cooldowns';
import { formatSpecBaselines, IBenchmarkData } from '../specBaselines';

function makeCooldown(spellName: string): IMajorCooldownInfo {
  return {
    spellId: '1',
    spellName,
    tag: 'Defensive',
    cooldownSeconds: 90,
    casts: [],
    availableWindows: [],
    neverUsed: false,
  };
}

const mockData: IBenchmarkData = {
  bySpec: {
    'Rogue Subtlety': {
      sampleCount: 56,
      defensiveTiming: { optimalPct: 43.2, earlyPct: 10.8, latePct: 13.5, reactivePct: 13.5, unknownPct: 18.9 },
      cdUsage: {
        'Cloak of Shadows': { neverUsedRate: 0.393, medianFirstUseSeconds: 94.314, p75FirstUseSeconds: 121.941 },
        'Shadow Blades': { neverUsedRate: 0.036, medianFirstUseSeconds: 20.664, p75FirstUseSeconds: 34.649 },
      },
    },
  },
};

describe('formatSpecBaselines', () => {
  it('returns SPEC BASELINES header and defensive timing for a known spec', () => {
    const lines = formatSpecBaselines('Rogue Subtlety', [], mockData);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toBe('SPEC BASELINES — Rogue Subtlety at ≥2100 MMR (n=56):');
    expect(lines.some((l) => l.includes('Optimal 43%'))).toBe(true);
    expect(lines.some((l) => l.includes('Late 14%'))).toBe(true);
    expect(lines.some((l) => l.includes('Reactive 14%'))).toBe(true);
  });

  it('includes CD rows only for CDs present in ownerCDs', () => {
    const ownerCDs = [makeCooldown('Cloak of Shadows'), makeCooldown('Shadow Blades')];
    const lines = formatSpecBaselines('Rogue Subtlety', ownerCDs, mockData);
    // Cloak: neverUsedRate=0.393 → 61% used; medianFirstUseSeconds=94.314 → 1:34
    expect(lines.some((l) => l.includes('Cloak of Shadows') && l.includes('61% used') && l.includes('1:34'))).toBe(
      true,
    );
    // Shadow Blades: neverUsedRate=0.036 → 96% used; medianFirstUseSeconds=20.664 → 0:20
    expect(lines.some((l) => l.includes('Shadow Blades') && l.includes('96% used') && l.includes('0:20'))).toBe(true);
  });

  it('excludes CD rows for CDs not in ownerCDs', () => {
    const ownerCDs = [makeCooldown('Cloak of Shadows')];
    const lines = formatSpecBaselines('Rogue Subtlety', ownerCDs, mockData);
    expect(lines.some((l) => l.includes('Cloak of Shadows'))).toBe(true);
    expect(lines.some((l) => l.includes('Shadow Blades'))).toBe(false);
  });

  it('displays — for null medianFirstUseSeconds and p75FirstUseSeconds', () => {
    const dataWithNull: IBenchmarkData = {
      bySpec: {
        'Test Spec': {
          sampleCount: 10,
          defensiveTiming: { optimalPct: 50, earlyPct: 10, latePct: 10, reactivePct: 10, unknownPct: 20 },
          cdUsage: {
            'Some Ability': { neverUsedRate: 1, medianFirstUseSeconds: null, p75FirstUseSeconds: null },
          },
        },
      },
    };
    const lines = formatSpecBaselines('Test Spec', [makeCooldown('Some Ability')], dataWithNull);
    expect(lines.some((l) => l.includes('Some Ability') && l.includes('0% used') && l.includes('—'))).toBe(true);
  });

  it('returns empty array for an unknown spec', () => {
    expect(formatSpecBaselines('Unknown Spec', [], mockData)).toEqual([]);
  });
});
