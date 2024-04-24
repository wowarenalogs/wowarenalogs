/* eslint-disable no-console */
import { Console } from 'console';
import { app } from 'electron';
import { createWriteStream } from 'fs-extra';
import path from 'path';

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

let logConsole = console;
// app will be undefined during preload compile
if (app && app.isPackaged) {
  const logPath = getAppDataPath();
  try {
    const output = createWriteStream(path.join(logPath, 'log.txt'));
    logConsole = new Console(output, output);
  } catch (e) {
    console.log('Could not create log file for errors! Falling back to standard console.');
    console.log(e);
  }
}

export const logger = logConsole;
