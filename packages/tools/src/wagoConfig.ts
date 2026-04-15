/**
 * Shared configuration for fetching WoW DB2 data from wago.tools.
 *
 * All ingestion scripts should import from here so there is a single
 * build number to update when a new WoW patch drops.
 */

export const WAGO_DB2_BASE = 'https://wago.tools/db2';
export const WAGO_BUILD = process.env.WAGO_BUILD || '12.0.1.66838';

/** Returns the wago.tools CSV URL for the given DB2 table. */
export const withBuild = (tableName: string) =>
  `${WAGO_DB2_BASE}/${tableName}/csv?build=${encodeURIComponent(WAGO_BUILD)}`;
