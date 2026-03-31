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

// Maps spell ID → effect types. Only covers Offensive-tagged spells in classMetadata.
// Multiple types stack multiplicatively (sum of weights).
export const SPELL_DANGER_DATA: Record<string, SpellEffectType[]> = {
  // Mage
  '190319': [SpellEffectType.DamageAmp],   // Combustion
  '12472':  [SpellEffectType.DamageAmp],   // Icy Veins
  '205025': [SpellEffectType.DamageAmp],   // Presence of Mind
  // Warrior
  '107574': [SpellEffectType.DamageAmp],   // Avatar
  // Paladin
  '31884':  [SpellEffectType.DamageAmp],   // Avenging Wrath
  // Hunter
  '19574':  [SpellEffectType.DamageAmp],   // Bestial Wrath
  // Rogue
  '13750':  [SpellEffectType.DamageAmp],   // Adrenaline Rush
  '51690':  [SpellEffectType.DamageAmp],   // Killing Spree
  '121471': [SpellEffectType.DamageAmp],   // Shadow Blades
  '185422': [SpellEffectType.DamageAmp],   // Shadow Dance
  '207736': [SpellEffectType.Vulnerability], // Shadowy Duel
  '79140':  [SpellEffectType.DamageAmp, SpellEffectType.HealReduction], // Vendetta/Deathmark
  // Druid
  '106951': [SpellEffectType.DamageAmp],   // Berserk
  // Shaman
  '114049': [SpellEffectType.DamageAmp],   // Ascendance
  '191634': [SpellEffectType.DamageAmp],   // Stormkeeper
  '305485': [SpellEffectType.DamageAmp],   // Lightning Lasso
  '197871': [SpellEffectType.DamageAmp],   // Dark Archangel
  // Demon Hunter
  '191427': [SpellEffectType.DamageAmp],   // Metamorphosis (Havoc)
};

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
 * = cdTierWeight × sum(effectTypeWeights)
 * Defaults to DamageAmp weight (1.0) if spell is not in SPELL_DANGER_DATA.
 */
export function spellDangerWeight(spellId: string, cooldownSeconds: number): number {
  const effects = SPELL_DANGER_DATA[spellId];
  const effectWeight = effects
    ? effects.reduce((sum, e) => sum + EFFECT_TYPE_WEIGHTS[e], 0)
    : EFFECT_TYPE_WEIGHTS[SpellEffectType.DamageAmp];
  return cdTierWeight(cooldownSeconds) * effectWeight;
}

/** Score label for display */
export function dangerLabel(score: number): 'Low' | 'Moderate' | 'High' | 'Critical' {
  if (score >= 7) return 'Critical';
  if (score >= 4) return 'High';
  if (score >= 2) return 'Moderate';
  return 'Low';
}
