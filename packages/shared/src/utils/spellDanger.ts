import { spells } from '../data/spellTags';

export enum SpellEffectType {
  DamageAmp = 'DamageAmp',
  HealReduction = 'HealReduction',
  Vulnerability = 'Vulnerability',
  Execution = 'Execution',
}

export const EFFECT_TYPE_WEIGHTS: Record<SpellEffectType, number> = {
  [SpellEffectType.DamageAmp]: 1.0,
  [SpellEffectType.HealReduction]: 1.5,
  [SpellEffectType.Vulnerability]: 1.2,
  [SpellEffectType.Execution]: 0.8,
};

/**
 * Effect type overrides for spells that are more dangerous than generic DamageAmp.
 * spells.json is the source of truth for *which* spells are offensive —
 * this table only needs entries for spells with non-DamageAmp effects.
 */
export const SPELL_EFFECT_OVERRIDES: Record<string, SpellEffectType[]> = {
  // DamageAmp + HealReduction
  '79140':  [SpellEffectType.DamageAmp, SpellEffectType.HealReduction], // Vendetta/Deathmark (Assassination Rogue)
  // HealReduction only
  '375901': [SpellEffectType.HealReduction],                            // Mindgames (Shadow Priest) — reverses heals into damage
  '386997': [SpellEffectType.HealReduction],                            // Soul Rot (Affliction Warlock) — applies heal-to-damage debuff
  // Vulnerability (target takes increased damage)
  '207736': [SpellEffectType.Vulnerability],                            // Shadowy Duel (Subtlety Rogue) — isolates + increases damage taken
};

/**
 * Returns true if spells.json classifies this spell as offensive.
 * This is the authoritative check — covers all 120 tagged offensive spells.
 */
export function isOffensiveSpell(spellId: string): boolean {
  const entry = spells[spellId];
  return entry?.type === 'buffs_offensive' || entry?.type === 'debuffs_offensive';
}

/**
 * Logarithmic CD tier weight.
 * 30s→0.0, 60s→0.69, 90s→1.10, 120s→1.39, 180s→1.79, 300s→2.30
 */
export function cdTierWeight(cooldownSeconds: number): number {
  if (cooldownSeconds < 30) return 0;
  return Math.log(cooldownSeconds / 30);
}

/**
 * Combined danger weight for a single spell cast.
 * Uses SPELL_EFFECT_OVERRIDES for non-DamageAmp effects; defaults to DamageAmp for
 * any spell tagged offensive in spells.json.
 */
export function spellDangerWeight(spellId: string, cooldownSeconds: number): number {
  const effects = SPELL_EFFECT_OVERRIDES[spellId] ?? [SpellEffectType.DamageAmp];
  const effectWeight = effects.reduce((sum, e) => sum + EFFECT_TYPE_WEIGHTS[e], 0);
  return cdTierWeight(cooldownSeconds) * effectWeight;
}

/** Score label for display */
export function dangerLabel(score: number): 'Low' | 'Moderate' | 'High' | 'Critical' {
  if (score >= 7) return 'Critical';
  if (score >= 4) return 'High';
  if (score >= 2) return 'Moderate';
  return 'Low';
}
