import chokidar from 'chokidar';
import fs from 'fs';
import { join } from 'path';

abstract class LogWatcher {
  constructor(protected wowDirectory: string) {}
  abstract onChange(handler: (fileName: string) => void): void;
  abstract close(): void;
}

class WindowsLogWatcher extends LogWatcher {
  private watcher: fs.FSWatcher;

  constructor(wowDirectory: string) {
    super(wowDirectory);
    const wowLogsDirectoryFullPath = join(wowDirectory, 'Logs');
    this.watcher = fs.watch(wowLogsDirectoryFullPath);
  }

  onChange(handler: (fileName: string) => void): void {
    this.watcher.on('change', (eventType, fileName) => {
      if (typeof fileName !== 'string' || fileName.indexOf('WoWCombatLog') < 0) {
        return;
      }
      handler(fileName);
    });
  }

  close(): void {
    this.watcher.close();
  }
}

class MacLogWatcher extends LogWatcher {
  private watcher: chokidar.FSWatcher;

  constructor(wowDirectory: string) {
    super(wowDirectory);
    const wowLogsDirectoryFullPath = join(wowDirectory, 'Logs');
    this.watcher = chokidar.watch('WoWCombatLog*.txt', {
      cwd: wowLogsDirectoryFullPath,
      disableGlobbing: false,
      useFsEvents: false,
      awaitWriteFinish: true,
    });
  }

  onChange(handler: (fileName: string) => void): void {
    this.watcher.on('change', (fileName) => {
      if (fileName.indexOf('WoWCombatLog') < 0) {
        return;
      }
      handler(fileName);
    });
  }

  close(): void {
    this.watcher.close();
  }
}

export const createLogWatcher = (wowDirectory: string, platform: string) => {
  const isMac = platform === 'darwin';
  return isMac ? new MacLogWatcher(wowDirectory) : new WindowsLogWatcher(wowDirectory);
};
