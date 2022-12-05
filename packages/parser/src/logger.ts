/* eslint-disable no-console */
const LOG_LEVEL = 0;

export const logInfo = (...args: unknown[]) => (LOG_LEVEL > 0 ? console.log(...args) : null);
