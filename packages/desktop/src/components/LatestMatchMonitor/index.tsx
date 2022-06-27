import { CombatReport, logAnalyticsEvent, useAuth, useClientContext, Utils as SharedUtils } from '@wowarenalogs/shared';
// import { remote } from 'electron';
// import { statSync } from 'fs-extra';
import _ from 'lodash';
import { useTranslation } from 'next-i18next';
import { useCallback } from 'react';
import { ICombatData, WoWCombatLogParser } from 'wow-combat-log-parser';

import { useLocalCombatsContext } from '../../hooks/LocalCombatLogsContext';
import { DesktopUtils } from '../../main-utils';
import { Waiting } from './Waiting';

export function LatestMatchMonitor() {
  const clientContext = useClientContext();
  const { t } = useTranslation();
  const auth = useAuth();
  const localCombatsContext = useLocalCombatsContext();
  const appIsPackaged = clientContext.appIsPackaged;

  const latestLocalCombat = localCombatsContext.localCombats.length
    ? localCombatsContext.localCombats[localCombatsContext.localCombats.length - 1]
    : null;

  // const parseLogFile = useCallback(
  //   (logFile: string) => {
  //     const logStat = statSync(logFile);

  //     const logParser = new WoWCombatLogParser();

  //     logParser.on('arena_match_ended', (data) => {
  //       if (appIsPackaged) {
  //         logAnalyticsEvent('event_ExistingMatchProcessed');
  //       }
  //       const combat = data as ICombatData;
  //       SharedUtils.uploadCombatAsync(combat, auth.userId as string);
  //       localCombatsContext.appendCombat(combat);
  //     });

  //     DesktopUtils.parseLogFileChunk(logParser, logFile, 0, logStat.size);
  //   },
  //   [auth.userId, localCombatsContext, appIsPackaged],
  // );

  const content = latestLocalCombat ? (
    <CombatReport key={latestLocalCombat.id} id={latestLocalCombat.id} combat={latestLocalCombat} />
  ) : (
    <Waiting
      processExistingLogs={() => {
        // remote.dialog
        //   .showOpenDialog({
        //     defaultPath: _.last(Array.from(clientContext.wowInstallations.entries()))?.[1],
        //     title: t('waiting-page-locate-combat-logs'),
        //     buttonLabel: t('confirm'),
        //     properties: ['openFile', 'multiSelections'],
        //     filters: [
        //       {
        //         name: 'WoWCombatLog-*.txt',
        //         extensions: ['txt'],
        //       },
        //     ],
        //   })
        //   .then((data) => {
        //     if (!data.canceled && data.filePaths.length > 0) {
        //       data.filePaths.forEach(parseLogFile);
        //     }
        //   });
      }}
    />
  );
  return content;
}
