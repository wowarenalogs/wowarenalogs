export type LogGrantDecision =
  | {
      allowed: true;
      charge: boolean;
      usedAfter: number;
    }
  | {
      allowed: false;
      usedToday: number;
      quota: number;
    };

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

export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
