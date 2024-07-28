/* eslint-disable no-console */
const LOG_LEVEL: 0 | 1 | 2 | 3 = 2;

export const logInfo = (...args: unknown[]) => (LOG_LEVEL > 0 ? console.log(...args) : null);
export const logWarning = (...args: unknown[]) => (LOG_LEVEL >= 1 ? console.log(...args) : null);
export const logDebug = (...args: unknown[]) => (LOG_LEVEL >= 2 ? console.log(...args) : null);
export const logTrace = (...args: unknown[]) => (LOG_LEVEL >= 3 ? console.log(...args) : null);
