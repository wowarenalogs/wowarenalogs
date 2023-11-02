/* eslint-disable no-console */
const LOG_LEVEL = 5;

export const logInfo = (...args: unknown[]) => (LOG_LEVEL > 0 ? console.log(...args) : null);
