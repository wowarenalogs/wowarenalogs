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
  logParsers: Map<string, WoWCombatLogParser>;
}

const bridgeState: {
  retail: IBridge;
  classic: IBridge;
} = {
  retail: {
    watcher: undefined,
    logParsers: new Map(),
  },
  classic: {
    watcher: undefined,
    logParsers: new Map(),
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

  public registerLogParserForFile(mainWindow: BrowserWindow, logFile: string, wowVersion: WowVersion) {
    const parser = new WoWCombatLogParser(wowVersion);
    bridgeState.retail.logParsers?.set(logFile, parser);

    parser.on('activity_started', (event) => {
      this.handleActivityStarted(mainWindow, event);
    });
    parser.on('arena_match_ended', (combat) => {
      this.handleNewCombat(mainWindow, combat);
    });
    parser.on('solo_shuffle_round_ended', (combat) => {
      this.handleSoloShuffleRoundEnded(mainWindow, combat);
    });
    parser.on('solo_shuffle_ended', (combat) => {
      this.handleSoloShuffleEnded(mainWindow, combat);
    });
    parser.on('battleground_ended', (data) => this.handleBattlegroundEnded(mainWindow, data));
    parser.on('malformed_arena_match_detected', (combat) => {
      this.handleMalformedCombatDetected(mainWindow, combat);
    });
    parser.on('parser_error', (error) => {
      this.handleParserError(mainWindow, error);
    });
    return parser;
  }

  @moduleFunction({ isRequired: true })
  public async startLogWatcher(mainWindow: BrowserWindow, wowDirectory: string, wowVersion: WowVersion) {
    const bridge = bridgeState[wowVersion] as IBridge;
    if (bridge.watcher) {
      bridge.watcher.close();
    }

    // If we start watching an entirely different folder, clear the parsers
    bridge.logParsers.clear();

    const wowLogsDirectoryFullPath = join(wowDirectory, 'Logs');

    bridge.watcher = createLogWatcher(wowDirectory, process.platform);

    // Check if there is actually a Logs folder
    //  In rare cases it is possible to have the game folder but not the Logs folder
    const logsExist = existsSync(wowLogsDirectoryFullPath);
    if (!logsExist) {
      mkdirSync(wowLogsDirectoryFullPath);
    }

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

    const processStats = async (path: string, stats: Stats | undefined) => {
      if (!bridge.logParsers) {
        throw new Error('No log parser');
      }

      const lastKnownState = lastKnownFileStats.get(path) || {
        lastFileCreationTime: 0,
        lastFileSize: 0,
      };
      const fileSizeDelta = (stats?.size || 0) - lastKnownState.lastFileSize;
      const fileCreationTimeDelta = Math.abs((stats?.birthtimeMs || 0) - lastKnownState.lastFileCreationTime);

      let parseOK = false;

      const parser = bridge.logParsers.get(path) || this.registerLogParserForFile(mainWindow, path, wowVersion);

      if (
        // we are reading the same file if the creation time is close enough
        fileCreationTimeDelta < 1 &&
        // and size is larger than before
        fileSizeDelta >= 0
      ) {
        parseOK = DesktopUtils.parseLogFileChunk(parser, path, lastKnownState.lastFileSize, fileSizeDelta);
      } else {
        // we are now reading a new combat log file, resetting states
        parser.resetParserStates(wowVersion);

        parseOK = DesktopUtils.parseLogFileChunk(parser, path, 0, stats?.size || 0);
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
    bridgeState.retail.logParsers?.forEach((parser) => {
      parser.removeAllListeners();
    });
    bridgeState.retail.logParsers.clear();
    bridgeState.retail.watcher = undefined;
    bridgeState.classic.watcher?.close();
    bridgeState.classic.logParsers?.forEach((parser) => {
      parser.removeAllListeners();
    });
    bridgeState.classic.logParsers.clear();
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
