import spellIdLists from './spellIdLists.json';

// Source of truth for replay-tracked spells:
// important + external defensive + big defensive.
export const awcSpellIds = [
  ...Array.from(
    new Set([
      ...spellIdLists.importantSpellIds,
      ...spellIdLists.externalDefensiveSpellIds,
      ...spellIdLists.bigDefensiveSpellIds,
    ]),
  ),
];
