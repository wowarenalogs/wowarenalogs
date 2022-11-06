import {
  ICombatData,
  IMalformedCombatData,
  IShuffleCombatData,
  IShuffleRoundData,
  WoWCombatLogParser,
  WowVersion,
} from '@wowarenalogs/parser';
import { BrowserWindow, dialog } from 'electron';
import { existsSync, mkdirSync, readdirSync, Stats, statSync } from 'fs-extra';
import { join } from 'path';

import { moduleEvent, moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../../module';
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
  retail: IBridge;
  classic: IBridge;
} = {
  retail: {
    watcher: undefined,
    logParser: undefined,
  },
  classic: {
    watcher: undefined,
    logParser: undefined,
  },
};

@nativeBridgeModule('logs')
export class LogsModule extends NativeBridgeModule {
  @moduleFunction()
  public async importLogFiles(mainWindow: BrowserWindow, wowDirectory: string, wowVersion: WowVersion) {
    dialog
      .showOpenDialog({
        defaultPath: wowDirectory,
        title: 'Manually import log files',
        buttonLabel: 'Confirm',
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'WoWCombatLog-*.txt',
            extensions: ['txt'],
          },
        ],
      })
      .then((data) => {
        if (!data.canceled && data.filePaths.length > 0) {
          const logParser = new WoWCombatLogParser(wowVersion);
          logParser.on('arena_match_ended', (c) => {
            const combat = c as ICombatData;
            this.handleNewCombat(mainWindow, combat);
          });

          logParser.on('solo_shuffle_round_ended', (c) => {
            const combat = c as IShuffleRoundData;
            this.handleSoloShuffleRoundEnded(mainWindow, combat);
          });

          logParser.on('solo_shuffle_ended', (c) => {
            const combat = c as IShuffleCombatData;
            this.handleSoloShuffleEnded(mainWindow, combat);
          });

          logParser.on('malformed_arena_match_detected', (c) => {
            const combat = c as IMalformedCombatData;
            this.handleMalformedCombatDetected(mainWindow, combat);
          });

          data.filePaths.forEach((logFile) => {
            const logStat = statSync(logFile);
            DesktopUtils.parseLogFileChunk(logParser, logFile, 0, logStat.size);
          });
        }
      });
  }

  @moduleFunction()
  public async startLogWatcher(mainWindow: BrowserWindow, wowDirectory: string, wowVersion: WowVersion) {
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
    bridge.logParser.on('arena_match_ended', (combat: ICombatData) => {
      this.handleNewCombat(mainWindow, combat);
    });
    bridge.logParser.on('solo_shuffle_round_ended', (combat: IShuffleRoundData) => {
      this.handleSoloShuffleRoundEnded(mainWindow, combat);
    });
    bridge.logParser.on('solo_shuffle_ended', (combat: IShuffleCombatData) => {
      this.handleSoloShuffleEnded(mainWindow, combat);
    });
    bridge.logParser.on('malformed_arena_match_detected', (combat: IMalformedCombatData) => {
      this.handleMalformedCombatDetected(mainWindow, combat);
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
    };

    bridge.watcher.onChange((fileName: string) => {
      const absolutePath = join(wowLogsDirectoryFullPath, fileName);
      const stats = statSync(absolutePath);
      processStats(absolutePath, stats);
    });
  }

  @moduleFunction()
  public async stopLogWatcher(_mainWindow: BrowserWindow) {
    bridgeState.retail.watcher?.close();
    bridgeState.retail.logParser?.removeAllListeners();
    bridgeState.retail.logParser = undefined;
    bridgeState.retail.watcher = undefined;
    bridgeState.classic.watcher?.close();
    bridgeState.classic.logParser?.removeAllListeners();
    bridgeState.classic.logParser = undefined;
    bridgeState.classic.watcher = undefined;
  }

  @moduleEvent('on')
  public handleNewCombat(_mainWindow: BrowserWindow, _combat: ICombatData) {}

  @moduleEvent('on')
  public handleSoloShuffleRoundEnded(_mainWindow: BrowserWindow, _combat: IShuffleRoundData) {}

  @moduleEvent('on')
  public handleSoloShuffleEnded(_mainWindow: BrowserWindow, _combat: IShuffleCombatData) {}

  @moduleEvent('on')
  public handleMalformedCombatDetected(_mainWindow: BrowserWindow, _combat: IMalformedCombatData) {}
}
