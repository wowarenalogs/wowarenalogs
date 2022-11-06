const LOG_LEVEL = 0;

export const logInfo = (...args: any[]) => (LOG_LEVEL > 0 ? console.log(...args) : null);
