/**
 * Pure decision logic for the daily raw-log quota. No I/O, no Firestore: the
 * transaction in accessGuard.ts reads today's usage, calls decideLogGrant, and
 * writes only when told to. Keeping this separate is what makes the counting
 * rules testable without an emulator (see test/test_log_quota.ts).
 */

export type LogGrantDecision =
  | {
      allowed: true;
      /** True when this match is new for today and must be appended to the usage doc. */
      charge: boolean;
      /** Distinct matches opened today after this request. */
      usedAfter: number;
    }
  | {
      allowed: false;
      usedToday: number;
      quota: number;
    };

/**
 * `openedToday` is the list of distinct match ids already opened today. The
 * list is treated as a set: duplicates never count twice, and a match already
 * present is always allowed and never charged, even when the user is at the
 * limit. A new match is allowed only while the count is below `quota`.
 */
export function decideLogGrant(openedToday: readonly string[], matchId: string, quota: number): LogGrantDecision {
  const opened = new Set(openedToday);
  if (opened.has(matchId)) {
    return { allowed: true, charge: false, usedAfter: opened.size };
  }
  if (opened.size >= quota) {
    return { allowed: false, usedToday: opened.size, quota };
  }
  return { allowed: true, charge: true, usedAfter: opened.size + 1 };
}

/** Day bucket for usage docs. Always UTC so the reset moment is the same for everyone. */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
