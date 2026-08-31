import {
  IActivityStarted,
  IArenaMatch,
  IBattlegroundCombat,
  IMalformedCombatData,
  IShuffleMatch,
  IShuffleRound,
  WoWCombatLogParser,
  WowVersion,
} from '@wowarenalogs/parser';
import checkDiskSpace from 'check-disk-space';
import { BrowserWindow, dialog } from 'electron';
import { existsSync, mkdirSync, readdirSync, Stats, statSync } from 'fs-extra';
import { join } from 'path';

import { logger } from '../../../logger';
import { moduleEvent, moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../../module';
import { DesktopUtils } from '../common/desktopUtils';
import { toDriveLabel } from '../common/driveUtils';
import { createLogWatcher } from './logWatcher';

interface ILastKnownCombatLogState {
  lastFileCreationTime: number;
  lastFileSize: number;
}

interface IBridge {
  watcher?: ReturnType<typeof createLogWatcher>;
  logParser?: WoWCombatLogParser;
  wowLogsDirectoryFullPath?: string;
  latestWarnedAtMs?: number;
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
const LOGS_DISK_SPACE_THRESHOLD = 1e9; // ~1gb
const LOGS_DISK_ALERT_COOLDOWN_MS = 60000;

// The log file has gone quiet, which means we'll never see another event to trigger emitting
// a buffered-but-unterminated match (e.g. the player disconnected mid-arena, or closed the app
// right after a match ended and ARENA_MATCH_END was never written). Flush both parsers now so
// that data isn't lost. Called both from the idle-timeout check and from app shutdown, since
// the idle timer alone can't catch "closed the app shortly after finishing".
export function flushAllLogParsers(): void {
  if (bridgeState.classic.logParser) {
    logger.info('Flushing classic log parser');
    bridgeState.classic.logParser.flush();
  }
  if (bridgeState.retail.logParser) {
    logger.info('Flushing retail log parser');
    bridgeState.retail.logParser.flush();
  }
}

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
        bridgeState.classic.logParser?.flush();
        this.handleLogReadingTimeout(mainWindow, 'classic', elapsed);
      }
    }
    if (bridgeState.retail.watcher) {
      const elapsed = now.getTime() - bridgeState.retail.watcher.lastReadDate.getTime();
      if (elapsed > READ_TIMEOUT_MS) {
        logger.info(`Log reading TIMEOUT wowVersion=retail elapsed=${elapsed}`);
        bridgeState.retail.logParser?.flush();
        this.handleLogReadingTimeout(mainWindow, 'retail', elapsed);
      }
    }
    return;
  }

  private async checkDiskSpaceAndNotify(mainWindow: BrowserWindow, wowVersion: WowVersion): Promise<void> {
    const bridge = bridgeState[wowVersion];
    if (!bridge.wowLogsDirectoryFullPath) {
      return;
    }

    const details = await checkDiskSpace(bridge.wowLogsDirectoryFullPath);
    if (details.free >= LOGS_DISK_SPACE_THRESHOLD) {
      return;
    }

    const now = Date.now();
    const latestWarnedAt = bridge.latestWarnedAtMs ?? 0;
    if (now - latestWarnedAt < LOGS_DISK_ALERT_COOLDOWN_MS) {
      return;
    }

    bridge.latestWarnedAtMs = now;
    this.handleLogStorageDiskSpaceBecameCritical(
      mainWindow,
      wowVersion,
      details.free,
      toDriveLabel(bridge.wowLogsDirectoryFullPath, details.diskPath),
    );
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

          logParser.on('battleground_ended', (bg) => {
            this.handleBattlegroundEnded(mainWindow, bg);
          });

          data.filePaths.forEach((logFile) => {
            const parseOK = DesktopUtils.parseLogFile(logParser, logFile);
            logger.info(`importLogFiles ${logFile} parseOK=${parseOK}`);
          });

          // The file may end mid-match (e.g. the game crashed, or logging stopped before
          // ARENA_MATCH_END was written) - which is exactly the kind of log users manually
          // import to recover. Flush so the trailing buffered match is emitted too.
          logParser.flush();
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
    bridge.wowLogsDirectoryFullPath = wowLogsDirectoryFullPath;
    bridge.latestWarnedAtMs = 0;

    bridge.watcher = createLogWatcher(wowDirectory, process.platform);

    // Check if there is actually a Logs folder
    //  In rare cases it is possible to have the game folder but not the Logs folder
    const logsExist = existsSync(wowLogsDirectoryFullPath);
    if (!logsExist) {
      mkdirSync(wowLogsDirectoryFullPath);
    }
    // logger.info here (rather than inside the handleXXX stubs below) is deliberate: the
    // @moduleEvent decorator replaces those method bodies entirely with an IPC send, so any
    // logging placed inside them would never run. This is the only place in the main process
    // that sees every parser lifecycle event, so it's where we persist a trail for diagnosing
    // "missing" matches after the fact - the winston logger writes to log.txt when packaged.
    bridge.logParser.on('activity_started', (event) => {
      logger.info(`[${wowVersion}] activity_started bracket=${event.arenaMatchStartInfo?.bracket ?? 'unknown'}`);
      this.handleActivityStarted(mainWindow, event);
    });
    bridge.logParser.on('arena_match_ended', (combat) => {
      logger.info(`[${wowVersion}] arena_match_ended id=${combat.id}`);
      this.handleNewCombat(mainWindow, combat);
    });
    bridge.logParser.on('solo_shuffle_round_ended', (combat) => {
      // Live, combat.endTime (the round-ending kill) and Date.now() come off the same clock,
      // so the gap is how long after the kill the round actually surfaced.
      logger.info(
        `[${wowVersion}] solo_shuffle_round_ended id=${combat.id} sequenceNumber=${combat.sequenceNumber} receiveLatencyMs=${Date.now() - combat.endTime}`,
      );
      this.handleSoloShuffleRoundEnded(mainWindow, combat);
    });
    bridge.logParser.on('solo_shuffle_ended', (combat) => {
      logger.info(`[${wowVersion}] solo_shuffle_ended id=${combat.id} rounds=${combat.rounds.length}`);
      this.handleSoloShuffleEnded(mainWindow, combat);
    });
    bridge.logParser.on('battleground_ended', (data) => {
      logger.info(`[${wowVersion}] battleground_ended id=${data.id}`);
      this.handleBattlegroundEnded(mainWindow, data);
    });
    bridge.logParser.on('malformed_arena_match_detected', (combat) => {
      logger.info(`[${wowVersion}] malformed_arena_match_detected id=${combat.id}`);
      this.handleMalformedCombatDetected(mainWindow, combat);
    });
    bridge.logParser.on('parser_error', (error) => {
      logger.error(`[${wowVersion}] parser_error: ${error.message}`);
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
        logger.info(`[${wowVersion}] onChange ${path} continuation +${fileSizeDelta}b`);
        parseOK = DesktopUtils.parseLogFileChunk(bridge.logParser, path, lastKnownState.lastFileSize, fileSizeDelta);
      } else {
        // we are now reading a new combat log file, resetting states
        logger.info(
          `[${wowVersion}] onChange ${path} new-file-reset size=${stats?.size ?? 0} creationTimeDelta=${fileCreationTimeDelta}`,
        );
        bridge.logParser.resetParserStates(wowVersion);
        DesktopUtils.resetChunkPartials(path);

        parseOK = DesktopUtils.parseLogFileChunk(bridge.logParser, path, 0, stats?.size || 0);
      }

      if (!parseOK) {
        logger.info(`[${wowVersion}] onChange ${path} parseLogFileChunk reported failure`);
      }

      if (parseOK) {
        updateLastKnownStats(path, stats);
      }
    };

    bridge.watcher.onChange((fileName: string) => {
      const absolutePath = join(wowLogsDirectoryFullPath, fileName);
      const stats = statSync(absolutePath);
      processStats(absolutePath, stats);
      this.checkDiskSpaceAndNotify(mainWindow, wowVersion).catch((err: unknown) => {
        logger.error(`checkDiskSpaceAndNotify failed for wowVersion=${wowVersion}: ${String(err)}`);
      });
    });

    this.checkDiskSpaceAndNotify(mainWindow, wowVersion).catch((err: unknown) => {
      logger.error(`checkDiskSpaceAndNotify failed for wowVersion=${wowVersion}: ${String(err)}`);
    });
  }

  @moduleFunction({ isRequired: true })
  public async stopLogWatcher(_mainWindow: BrowserWindow) {
    bridgeState.retail.watcher?.close();
    bridgeState.retail.logParser?.removeAllListeners();
    bridgeState.retail.logParser = undefined;
    bridgeState.retail.watcher = undefined;
    bridgeState.retail.wowLogsDirectoryFullPath = undefined;
    bridgeState.retail.latestWarnedAtMs = 0;
    bridgeState.classic.watcher?.close();
    bridgeState.classic.logParser?.removeAllListeners();
    bridgeState.classic.logParser = undefined;
    bridgeState.classic.watcher = undefined;
    bridgeState.classic.wowLogsDirectoryFullPath = undefined;
    bridgeState.classic.latestWarnedAtMs = 0;
  }

  @moduleFunction()
  public async triggerLowDiskSpaceAlertForTesting(
    mainWindow: BrowserWindow,
    wowVersion: WowVersion = 'retail',
    bytesRemaining: number = LOGS_DISK_SPACE_THRESHOLD - 1,
  ) {
    const bridge = bridgeState[wowVersion];
    const driveLabel = toDriveLabel(bridge.wowLogsDirectoryFullPath ?? '');
    this.handleLogStorageDiskSpaceBecameCritical(mainWindow, wowVersion, bytesRemaining, driveLabel);
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

  @moduleEvent('on')
  public handleLogStorageDiskSpaceBecameCritical(
    _mainWindow: BrowserWindow,
    _wowVersion: WowVersion,
    _bytesRemaining: number,
    _driveLabel?: string,
  ) {
    return;
  }
}
