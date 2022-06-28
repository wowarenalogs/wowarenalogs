import { ICombatData, WoWCombatLogParser, WowVersion } from '@wowarenalogs/parser';
import { BrowserWindow } from 'electron';
import { existsSync, mkdirSync, readdirSync, Stats, statSync } from 'fs-extra';
import { join } from 'path';
import { createLogWatcher } from '../logWatcher';
import { NativeBridgeModule } from '../module';
import { DesktopUtils } from '../utils';

interface ILastKnownCombatLogState {
  lastFileCreationTime: number;
  lastFileSize: number;
}

const bridgeState: {
  watcher?: ReturnType<typeof createLogWatcher>;
  logParser?: WoWCombatLogParser;
} = {
  watcher: undefined,
  logParser: undefined,
};

export class LogsModule extends NativeBridgeModule {
  constructor() {
    super('logs');
  }

  public async startLogWatcher(mainWindow: BrowserWindow, wowDirectory: string, wowVersion: WowVersion) {
    if (bridgeState.watcher) {
      bridgeState.watcher.close();
    }

    bridgeState.logParser = new WoWCombatLogParser(wowVersion);
    const wowLogsDirectoryFullPath = join(wowDirectory, 'Logs');

    bridgeState.watcher = createLogWatcher(wowDirectory, process.platform);

    // Check if there is actually a Logs folder
    //  In rare cases it is possible to have the game folder but not the Logs folder
    const logsExist = existsSync(wowLogsDirectoryFullPath);
    if (!logsExist) {
      mkdirSync(wowLogsDirectoryFullPath);
    }

    bridgeState.logParser.on('arena_match_ended', (data) => {
      const combat = data as ICombatData;
      // TODO: refactor send() names
      mainWindow.webContents.send('wowarenalogs:logs:handleNewCombat', combat);
    });

    const lastKnownFileStats = new Map<string, ILastKnownCombatLogState>();

    const updateLastKnownStats = (path: string, stats: Stats | undefined) => {
      lastKnownFileStats.set(path, {
        lastFileCreationTime: stats?.birthtimeMs || 0,
        lastFileSize: stats?.size || 0,
      });
    };

    const logFiles = readdirSync(wowLogsDirectoryFullPath).filter((f) => f.indexOf('WoWCombatLog') >= 0);
    logFiles.forEach((f) => {
      const fullLogPath = join(wowLogsDirectoryFullPath, f);
      const stats = statSync(fullLogPath);
      updateLastKnownStats(fullLogPath, stats);
    });

    const processStats = (path: string, stats: Stats | undefined) => {
      if (!bridgeState.logParser) {
        throw new Error('No log parser');
      }

      const lastKnownState = lastKnownFileStats.get(path) || {
        lastFileCreationTime: 0,
        lastFileSize: 0,
      };
      const fileSizeDelta = (stats?.size || 0) - lastKnownState.lastFileSize;
      if (
        // we are reading the same file if the creation time is close enough
        Math.abs((stats?.birthtimeMs || 0) - lastKnownState.lastFileCreationTime) < 1 &&
        // and size is larger than before
        fileSizeDelta >= 0
      ) {
        DesktopUtils.parseLogFileChunk(bridgeState.logParser, path, lastKnownState.lastFileSize, fileSizeDelta);
      } else {
        // we are now reading a new combat log file, resetting states
        bridgeState.logParser.resetParserStates(wowVersion);

        DesktopUtils.parseLogFileChunk(bridgeState.logParser, path, 0, stats?.size || 0);
      }

      updateLastKnownStats(path, stats);
    };

    bridgeState.watcher.onChange((fileName: string) => {
      const absolutePath = join(wowLogsDirectoryFullPath, fileName);
      const stats = statSync(absolutePath);
      processStats(absolutePath, stats);
    });
  }

  public async stopLogWatcher(_mainWindow: BrowserWindow) {
    bridgeState.watcher?.close();
    bridgeState.logParser?.removeAllListeners();
    bridgeState.logParser = undefined;
    bridgeState.watcher = undefined;
  }

  public getInvokables() {
    return [
      {
        name: 'startLogWatcher',
        invocation: this.startLogWatcher,
      },
      {
        name: 'stopLogWatcher',
        invocation: this.stopLogWatcher,
      },
    ];
  }
}
// const bridgeAPI = {
//   handleNewCombat: (callback: (event: IpcRendererEvent, c: ICombatData) => void) =>
//     ipcRenderer.on(Events.newCombatEvent, callback),

//   startLogWatcher: (wowDirectory: string, wowVersion: WowVersion) =>
//     ipcRenderer.invoke(Events.startLogWatcher, wowDirectory, wowVersion) as Promise<
//       ReturnType<typeof onStartLogWatcher>
//     >,
//   stopLogWatcher: () => ipcRenderer.invoke(Events.stopLogWatcher) as Promise<ReturnType<typeof onStopLogWatcher>>,
// };
