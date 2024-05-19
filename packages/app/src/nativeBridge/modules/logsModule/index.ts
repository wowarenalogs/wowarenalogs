import {
  IActivityStarted,
  IArenaMatch,
  IMalformedCombatData,
  IShuffleMatch,
  IShuffleRound,
  WoWCombatLogParser,
  WowVersion,
} from '@wowarenalogs/parser';
import { IBattlegroundCombat } from '@wowarenalogs/parser/dist/CombatData';
import { BrowserWindow, dialog } from 'electron';
import { existsSync, mkdirSync, readdirSync, Stats, statSync } from 'fs-extra';
import { join } from 'path';

import { logger } from '../../../logger';
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

const READ_TIMEOUT_MS = 300000;

@nativeBridgeModule('logs')
export class LogsModule extends NativeBridgeModule {
  protected lastChangeEventTime = new Date();

  public onRegistered(mainWindow: BrowserWindow): void {
    setInterval(() => this.checkLastViableRead(mainWindow), READ_TIMEOUT_MS - 100);
  }

  private checkLastViableRead(mainWindow: BrowserWindow) {
    const now = new Date();
    if (bridgeState.classic.watcher) {
      const elapsed = now.getTime() - bridgeState.classic.watcher.lastReadDate.getTime();
      if (elapsed > READ_TIMEOUT_MS) {
        logger.info(`Log reading TIMEOUT wowVersion=classic elapsed=${elapsed}`);
        this.handleLogReadingTimeout(mainWindow, 'classic', elapsed);
      }
    }
    if (bridgeState.retail.watcher) {
      const elapsed = now.getTime() - bridgeState.retail.watcher.lastReadDate.getTime();
      if (elapsed > READ_TIMEOUT_MS) {
        logger.info(`Log reading TIMEOUT wowVersion=retail elapsed=${elapsed}`);
        this.handleLogReadingTimeout(mainWindow, 'retail', elapsed);
      }
    }
    return;
  }

  @moduleFunction({ isRequired: true })
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
          logParser.on('arena_match_ended', (combat) => {
            this.handleNewCombat(mainWindow, combat);
          });

          logParser.on('solo_shuffle_round_ended', (combat) => {
            this.handleSoloShuffleRoundEnded(mainWindow, combat);
          });

          logParser.on('solo_shuffle_ended', (combat) => {
            this.handleSoloShuffleEnded(mainWindow, combat);
          });

          logParser.on('malformed_arena_match_detected', (combat) => {
            this.handleMalformedCombatDetected(mainWindow, combat);
          });

          logParser.on('parser_error', (error: Error) => {
            // We need to pickle the error object out here a bit to help it seralize correctly over the message bus
            this.handleParserError(mainWindow, {
              name: error.name,
              message: error.message,
              stack: error.stack,
            });
          });

          data.filePaths.forEach((logFile) => {
            DesktopUtils.parseLogFile(logParser, logFile);
          });
        }
      });
  }

  @moduleFunction({ isRequired: true })
  public async startLogWatcher(mainWindow: BrowserWindow, wowDirectory: string, wowVersion: WowVersion) {
    const bridge = bridgeState[wowVersion] as IBridge; // why can TS not figure this out?
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
    bridge.logParser.on('activity_started', (event) => {
      this.handleActivityStarted(mainWindow, event);
    });
    bridge.logParser.on('arena_match_ended', (combat) => {
      this.handleNewCombat(mainWindow, combat);
    });
    bridge.logParser.on('solo_shuffle_round_ended', (combat) => {
      this.handleSoloShuffleRoundEnded(mainWindow, combat);
    });
    bridge.logParser.on('solo_shuffle_ended', (combat) => {
      this.handleSoloShuffleEnded(mainWindow, combat);
    });
    bridge.logParser.on('battleground_ended', (data) => this.handleBattlegroundEnded(mainWindow, data));
    bridge.logParser.on('malformed_arena_match_detected', (combat) => {
      this.handleMalformedCombatDetected(mainWindow, combat);
    });
    bridge.logParser.on('parser_error', (error) => {
      this.handleParserError(mainWindow, error);
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

  @moduleFunction({ isRequired: true })
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
  public handleActivityStarted(_mainWindow: BrowserWindow, _event: IActivityStarted) {
    return;
  }

  @moduleEvent('on', { isRequired: true })
  public handleNewCombat(_mainWindow: BrowserWindow, _combat: IArenaMatch) {
    return;
  }

  @moduleEvent('on', { isRequired: true })
  public handleSoloShuffleRoundEnded(_mainWindow: BrowserWindow, _combat: IShuffleRound) {
    return;
  }

  @moduleEvent('on', { isRequired: true })
  public handleSoloShuffleEnded(_mainWindow: BrowserWindow, _combat: IShuffleMatch) {
    return;
  }

  @moduleEvent('on')
  public handleBattlegroundEnded(_mainWindow: BrowserWindow, _bg: IBattlegroundCombat) {
    return;
  }

  @moduleEvent('on', { isRequired: true })
  public handleMalformedCombatDetected(_mainWindow: BrowserWindow, _combat: IMalformedCombatData) {
    return;
  }

  @moduleEvent('on', { isRequired: true })
  public handleParserError(_mainWindow: BrowserWindow, _error: Error) {
    return;
  }

  @moduleEvent('on')
  public handleLogReadingTimeout(_mainWindow: BrowserWindow, _wowVersion: WowVersion, _timeoutSeconds: number) {
    return;
  }
}
