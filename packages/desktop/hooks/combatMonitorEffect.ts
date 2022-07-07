import { ICombatData, WowVersion } from '@wowarenalogs/parser';
import { logAnalyticsEvent } from '@wowarenalogs/shared';

export function combatMonitorEffect(
  wowDirectory: string,
  wowVersion: WowVersion,
  userId: string,
  onNewCombatEnded: (combat: ICombatData) => void,
  onClearCombats: () => void,
) {
  window.wowarenalogs.logs?.startLogWatcher(wowDirectory, wowVersion);

  window.wowarenalogs.logs?.handleNewCombat((_event, combat) => {
    if (
      window.wowarenalogs.app?.getIsPackaged().then((isPackaged) => {
        if (isPackaged) {
          logAnalyticsEvent('event_NewMatchProcessed', {
            wowVersion: combat.wowVersion,
          });
        }
      })
    )
      if (wowVersion === combat.wowVersion) {
        // TODO: write upload utiltiy
        // SharedUtils.uploadCombatAsync(combat, userId);

        // console.log('combatMonitorEffect.handleNewCombat', combat);
        // TODO: a more robust way of making sure the handlers only sign up for a single version
        onNewCombatEnded(combat);
      }
  });

  return () => {
    window.wowarenalogs.logs?.stopLogWatcher();
    window.wowarenalogs.logs?.removeAll_handleNewCombat_listeners();
    onClearCombats();
  };
}
