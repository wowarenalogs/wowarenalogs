import chokidar from 'chokidar';
import { FSWatcher, watch } from 'fs';
import { join } from 'path';

import { logger } from '../../../logger';

abstract class LogWatcher {
  public lastReadDate = new Date();
  constructor(protected wowDirectory: string) {}
  abstract onChange(handler: (fileName: string) => void): void;
  abstract close(): void;
}

class WindowsLogWatcher extends LogWatcher {
  private watcher: FSWatcher;

  constructor(wowDirectory: string) {
    super(wowDirectory);
    const wowLogsDirectoryFullPath = join(wowDirectory, 'Logs');
    this.watcher = watch(wowLogsDirectoryFullPath);
  }

  onChange(handler: (fileName: string) => void): void {
    this.watcher.on('change', (eventType: string, fileName: string) => {
      this.lastReadDate = new Date();
      logger.info(`Log.onChange ${this.lastReadDate}`);
      if (eventType === 'rename') {
        // rename fires on new-file-creation and file-deletion
        // however-- a 'change' event *also* fires when the bytes are written
        // which means a rename/change are created at almost identical times for new files
        // dropping all 'rename' events avoids this weird race that can cause issues with openSync reporting
        // a locked file
        return;
      }
      // console.log('WinWatcher.onChange', eventType, fileName);
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
      this.lastReadDate = new Date();
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

class LinuxLogWatcher extends LogWatcher {
  private watcher: FSWatcher;

  constructor(wowDirectory: string) {
    super(wowDirectory);
    const wowLogsDirectoryFullPath = join(wowDirectory, 'Logs');
    this.watcher = watch(wowLogsDirectoryFullPath);
  }

  onChange(handler: (fileName: string) => void): void {
    this.watcher.on('change', (_eventType: string, fileName: string) => {
      this.lastReadDate = new Date();
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

export const createLogWatcher = (wowDirectory: string, platform: string) => {
  return platform === 'darwin'
    ? new MacLogWatcher(wowDirectory)
    : platform === 'linux'
    ? new LinuxLogWatcher(wowDirectory)
    : new WindowsLogWatcher(wowDirectory);
};
