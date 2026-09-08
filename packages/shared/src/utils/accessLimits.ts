/**
 * Limits on match discovery and raw log access.
 *
 * Client-safe: no server imports. Enforced in graphql-server/utils/accessGuard.ts;
 * the UI reads them only to explain a refusal.
 *
 * The threat model is enumeration at scale, not repeat viewing: search and
 * pagination are unmetered for signed-in users, and the log quota counts
 * *distinct* logs per user per UTC day, so re-opening a match is free.
 */

/** Matches must be at least this old before they appear in search results. */
export const SEARCH_EMBARGO_MS = 60 * 60 * 1000;

/**
 * Distinct raw logs a signed-in user may open per UTC day, by subscription
 * tier. Opening a log already counted today does not count again.
 */
export const LOG_DAILY_DOWNLOAD_QUOTA: Record<'Common' | 'Rare', number> = {
  Common: 100,
  Rare: 500,
};

/** Lifetime of a signed log download URL. Long enough to fetch, too short to share. */
export const LOG_URL_TTL_MS = 10 * 60 * 1000;

/** A user profile carrying this tag is refused search and log access. */
export const ACCESS_BLOCKED_TAG = 'blocked';
