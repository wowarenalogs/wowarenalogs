import { ICombatData, WoWCombatLogParser, WowVersion } from '@wowarenalogs/parser';
import { BrowserWindow } from 'electron';
import { existsSync, mkdirSync, readdirSync, Stats, statSync } from 'fs-extra';
import { join } from 'path';

import { NativeBridgeModule } from '../../module';
import { DesktopUtils } from '../common/desktopUtils';
import { createLogWatcher } from './logWatcher';

interface ILastKnownCombatLogState {
  lastFileCreationTime: number;
  lastFileSize: number;
}

interface IBridge {
  watcher?: ReturnType<typeof createLogWatcher>;
  logParser?: WoWCombatLogParser;
}

const bridgeState: {
  shadowlands: IBridge;
  tbc: IBridge;
} = {
  shadowlands: {
    watcher: undefined,
    logParser: undefined,
  },
  tbc: {
    watcher: undefined,
    logParser: undefined,
  },
};

export class LogsModule extends NativeBridgeModule {
  constructor() {
    super('logs');
  }

  public async startLogWatcher(mainWindow: BrowserWindow, wowDirectory: string, wowVersion: WowVersion) {
    // console.log('node-LogWatcherStart', wowDirectory, wowVersion);
    const bridge = bridgeState[wowVersion];
    if (bridge.watcher) {
      bridge.watcher.close();
    }

    bridge.logParser = new WoWCombatLogParser(wowVersion);
    const wowLogsDirectoryFullPath = join(wowDirectory, 'Logs');

    bridge.watcher = createLogWatcher(wowDirectory, process.platform);

    // Check if there is actually a Logs folder
    //  In rare cases it is possible to have the game folder but not the Logs folder
    const logsExist = existsSync(wowLogsDirectoryFullPath);
    if (!logsExist) {
      mkdirSync(wowLogsDirectoryFullPath);
    }
    // console.log('node-LogsExist?', logsExist);

    bridge.logParser.on('arena_match_ended', (data) => {
      const combat = data as ICombatData;
      // console.log('new combat', wowVersion, data.id);
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
    // console.log('node-logsCount', logFiles.length);
    logFiles.forEach((f) => {
      const fullLogPath = join(wowLogsDirectoryFullPath, f);
      const stats = statSync(fullLogPath);
      updateLastKnownStats(fullLogPath, stats);
    });

    const processStats = (path: string, stats: Stats | undefined) => {
      if (!bridge.logParser) {
        throw new Error('No log parser');
      }

      const lastKnownState = lastKnownFileStats.get(path) || {
        lastFileCreationTime: 0,
        lastFileSize: 0,
      };
      const fileSizeDelta = (stats?.size || 0) - lastKnownState.lastFileSize;
      const fileCreationTimeDelta = Math.abs((stats?.birthtimeMs || 0) - lastKnownState.lastFileCreationTime);

      let parseOK = false;

      // console.log('Maybeprocess?', { fileCreationTimeDelta, fileSizeDelta });
      if (
        // we are reading the same file if the creation time is close enough
        fileCreationTimeDelta < 1 &&
        // and size is larger than before
        fileSizeDelta >= 0
      ) {
        parseOK = DesktopUtils.parseLogFileChunk(bridge.logParser, path, lastKnownState.lastFileSize, fileSizeDelta);
      } else {
        // we are now reading a new combat log file, resetting states
        bridge.logParser.resetParserStates(wowVersion);

        parseOK = DesktopUtils.parseLogFileChunk(bridge.logParser, path, 0, stats?.size || 0);
      }

      if (parseOK) {
        updateLastKnownStats(path, stats);
      }
      // console.log('parseResult', parseOK.toString());
    };

    bridge.watcher.onChange((fileName: string) => {
      // console.log('#### watcher.onChange', fileName);
      const absolutePath = join(wowLogsDirectoryFullPath, fileName);
      // console.log('watcher.absolutePath', absolutePath);
      const stats = statSync(absolutePath);
      // console.log('watcher.stats', stats.size, stats.birthtimeMs);
      processStats(absolutePath, stats);
      // console.log('watcher.processed...', fileName);
    });
  }

  public async stopLogWatcher(_mainWindow: BrowserWindow) {
    bridgeState.shadowlands.watcher?.close();
    bridgeState.shadowlands.logParser?.removeAllListeners();
    bridgeState.shadowlands.logParser = undefined;
    bridgeState.shadowlands.watcher = undefined;
    bridgeState.tbc.watcher?.close();
    bridgeState.tbc.logParser?.removeAllListeners();
    bridgeState.tbc.logParser = undefined;
    bridgeState.tbc.watcher = undefined;
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
