import { disarmSpellIds, interruptSpellIds, rootSpellIds } from '../../data/spellTags';

describe('rootSpellIds', () => {
  it('contains Frost Nova (122)', () => expect(rootSpellIds.has('122')).toBe(true));
  it('contains Entangling Roots (339)', () => expect(rootSpellIds.has('339')).toBe(true));
  it('contains Freeze / Water Ele (33395)', () => expect(rootSpellIds.has('33395')).toBe(true));
  it('does not contain a CC spell (Kidney Shot 408)', () => expect(rootSpellIds.has('408')).toBe(false));
});

describe('interruptSpellIds', () => {
  it('contains Kick/Rogue (1766)', () => expect(interruptSpellIds.has('1766')).toBe(true));
  it('contains Counterspell/Mage (2139)', () => expect(interruptSpellIds.has('2139')).toBe(true));
  it('contains Pummel/Warrior (6552)', () => expect(interruptSpellIds.has('6552')).toBe(true));
  it('does not contain a CC spell (Polymorph 118)', () => expect(interruptSpellIds.has('118')).toBe(false));
});

describe('disarmSpellIds', () => {
  it('contains Faerie Swarm/Druid (209749)', () => expect(disarmSpellIds.has('209749')).toBe(true));
  it('contains Grapple Weapon/Monk (233759)', () => expect(disarmSpellIds.has('233759')).toBe(true));
  it('contains Disarm/Warrior (236077)', () => expect(disarmSpellIds.has('236077')).toBe(true));
  it('does not contain 207777 (already classified as Incapacitate CC)', () => {
    expect(disarmSpellIds.has('207777')).toBe(false);
  });
});
