import { Console } from 'console';
import { app } from 'electron';
import { createWriteStream } from 'fs-extra';

let logConsole = console;
if (app && app.isPackaged) {
  // app will be undefined during preload compile
  const output = createWriteStream('./log.txt');
  logConsole = new Console(output, output);
}

export const logger = logConsole;
