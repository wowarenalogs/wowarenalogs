/**
 * Kill switch for the public match discovery ("search") API and UI.
 *
 * While true, every GraphQL query that lets a caller enumerate matches they do
 * not own (latestMatches, userMatches, characterMatches, recentMatchesWithCombatant,
 * matchesWithOwnerId) rejects the request before touching Firestore, and the search
 * page shows a discontinuation notice instead of the filter UI.
 *
 * myMatches and matchById are unaffected: they only return matches the caller
 * already owns or already holds an id for.
 */
export const SEARCH_DISABLED = true;

export const SEARCH_DISABLED_TITLE = 'Match search is discontinued';

export const SEARCH_DISABLED_MESSAGE =
  'Automated scraping of search results has driven our hosting costs up sharply, so match search is ' +
  'discontinued until we can find a way to prevent it. Your own uploaded matches and any match shared ' +
  'with you by link are still available.';
