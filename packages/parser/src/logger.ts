/* eslint-disable no-console */
const DEFAULT_LOG_LEVEL = 0;
const LOG_LEVEL: 0 | 1 | 2 | 3 = (() => {
  if (typeof process === 'undefined' || !process.env) {
    return DEFAULT_LOG_LEVEL;
  }

  const rawLevel = process.env.PARSER_LOG_LEVEL ?? '';
  const parsed = Number(rawLevel);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_LOG_LEVEL;
  }

  if (parsed <= 0) {
    return 0;
  }
  if (parsed >= 3) {
    return 3;
  }
  return parsed as 1 | 2;
})();

export const logInfo = (...args: unknown[]) => (LOG_LEVEL > 0 ? console.log(...args) : null);
export const logWarning = (...args: unknown[]) => (LOG_LEVEL >= 1 ? console.log(...args) : null);
export const logDebug = (...args: unknown[]) => (LOG_LEVEL >= 2 ? console.log(...args) : null);
export const logTrace = (...args: unknown[]) => (LOG_LEVEL >= 3 ? console.log(...args) : null);
