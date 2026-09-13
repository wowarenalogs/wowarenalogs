export const SEARCH_EMBARGO_MS = 60 * 60 * 1000;

// Distinct logs per user per UTC day.
export const LOG_DAILY_DOWNLOAD_QUOTA = 15;

export const LOG_URL_TTL_MS = 10 * 60 * 1000;

// Strings in the `tags` array of the user's Firestore profile doc.
export const ACCESS_BLOCKED_TAG = 'blocked';
export const ACCESS_ADMIN_TAG = 'admin';
