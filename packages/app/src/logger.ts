/* eslint-disable no-console */
import { app } from 'electron';
import path from 'path';
import winston from 'winston';

function getAppDataPath() {
  switch (process.platform) {
    // As of 3/13/2024 these path expansions are actually where electron itself writes its support files
    case 'darwin': {
      return path.join(process.env.HOME as string, 'Library', 'Application Support', 'WoW Arena Logs');
    }
    case 'win32': {
      return path.join(process.env.APPDATA as string, 'WoW Arena Logs');
    }
    case 'linux': {
      return path.join(process.env.HOME as string, '.wowarenalogs');
    }
    default: {
      console.log('Unsupported platform!');
      process.exit(1);
    }
  }
}

const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} [${level}] ${message}`;
    }),
  ),
  transports: [],
});
winstonLogger.add(new winston.transports.Console());

// app will be undefined during preload compile
if (app && app.isPackaged) {
  const logPath = getAppDataPath();
  try {
    winstonLogger.add(new winston.transports.File({ filename: path.join(logPath, 'log.txt'), level: 'info' }));
  } catch (e) {
    console.log('Could not create log file for errors! Falling back to standard console.');
    console.log(e);
  }
}
winstonLogger.add(new winston.transports.File({ filename: path.join('log.txt'), level: 'info' }));
export const logger = winstonLogger;
