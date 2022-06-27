import { logAnalyticsEvent, Utils as SharedUtils } from '@wowarenalogs/shared';
import { ICombatData, WowVersion } from 'wow-combat-log-parser';

export function combatMonitorEffect(
  wowDirectory: string,
  wowVersion: WowVersion,
  userId: string,
  onNewCombatEnded: (combat: ICombatData) => void,
  onClearCombats: () => void,
  appIsPackaged: boolean,
) {
  window.walLoggerBridge.startLogWatcher(wowDirectory, wowVersion);

  window.walLoggerBridge.handleNewCombat((combat: ICombatData) => {
    if (appIsPackaged) {
      logAnalyticsEvent('event_NewMatchProcessed', {
        wowVersion: combat.wowVersion,
      });
    }
    SharedUtils.uploadCombatAsync(combat, userId);
    onNewCombatEnded(combat);
  });

  return () => {
    window.walLoggerBridge.stopLogWatcher();
    onClearCombats();
  };
}
