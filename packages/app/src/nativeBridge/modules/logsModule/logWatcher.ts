import chokidar from 'chokidar';
import { FSWatcher, watch } from 'fs';
import { join } from 'path';

abstract class LogWatcher {
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
