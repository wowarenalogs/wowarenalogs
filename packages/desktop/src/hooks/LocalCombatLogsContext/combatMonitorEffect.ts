import { logAnalyticsEvent, Utils as SharedUtils } from '@wowarenalogs/shared';
import { remote } from 'electron';
import { statSync, readdirSync, Stats, existsSync, mkdirSync } from 'fs-extra';
import { join } from 'path';
import { ICombatData, WoWCombatLogParser, WowVersion } from 'wow-combat-log-parser';

import { DesktopUtils } from '../../utils';
import { createLogWatcher } from '../../utils/logWatcher';

interface ILastKnownCombatLogState {
  lastFileCreationTime: number;
  lastFileSize: number;
}

export function combatMonitorEffect(
  wowDirectory: string,
  wowVersion: WowVersion,
  userId: string,
  onNewCombatEnded: (combat: ICombatData) => void,
  onClearCombats: () => void,
  platform: string,
  appIsPackaged: boolean,
) {
  const logParser = new WoWCombatLogParser(wowVersion);

  const wowLogsDirectoryFullPath = join(wowDirectory, 'Logs');

  // Check if there is actually a Logs folder
  //  In rare cases it is possible to have the game folder but not the Logs folder
  const logsExist = existsSync(wowLogsDirectoryFullPath);
  if (!logsExist) {
    mkdirSync(wowLogsDirectoryFullPath);
  }

  const watcher = createLogWatcher(wowDirectory, platform);

  logParser.on('arena_match_ended', (data) => {
    if (appIsPackaged) {
      logAnalyticsEvent('event_NewMatchProcessed', {
        wowVersion: (data as ICombatData).wowVersion,
      });
    }

    const combat = data as ICombatData;
    SharedUtils.uploadCombatAsync(combat, userId);
    onNewCombatEnded(combat);
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
      DesktopUtils.parseLogFileChunk(logParser, path, lastKnownState.lastFileSize, fileSizeDelta);
    } else {
      // we are now reading a new combat log file, resetting states
      logParser.resetParserStates(wowVersion);

      DesktopUtils.parseLogFileChunk(logParser, path, 0, stats?.size || 0);
    }

    updateLastKnownStats(path, stats);
  };

  watcher.onChange((fileName: string) => {
    const absolutePath = join(wowLogsDirectoryFullPath, fileName);
    const stats = statSync(absolutePath);
    processStats(absolutePath, stats);
  });

  return () => {
    watcher.close();
    logParser.removeAllListeners();
    onClearCombats();
  };
}
