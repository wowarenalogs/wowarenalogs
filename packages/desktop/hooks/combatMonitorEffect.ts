import { ICombatData, WowVersion } from '@wowarenalogs/parser';

export function combatMonitorEffect(
  wowDirectory: string,
  wowVersion: WowVersion,
  userId: string,
  onNewCombatEnded: (combat: ICombatData) => void,
  onClearCombats: () => void,
) {
  console.log('Monitor Effect', wowDirectory, wowVersion);

  window.wowarenalogs.logs?.startLogWatcher(wowDirectory, wowVersion);

  window.wowarenalogs.logs?.handleNewCombat((_event, combat) => {
    // TODO: fix analytics
    // if (window.wowarenalogs.appIsPackaged) {
    //   logAnalyticsEvent('event_NewMatchProcessed', {
    //     wowVersion: combat.wowVersion,
    //   });
    // }

    // TODO: write upload utiltiy
    // SharedUtils.uploadCombatAsync(combat, userId);

    console.log('combatMonitorEffect.handleNewCombat', combat);
    // TODO: a more robust way of making sure the handlers only sign up for a single version
    if (wowVersion === combat.wowVersion) {
      onNewCombatEnded(combat);
    }
  });

  return () => {
    window.wowarenalogs.logs?.stopLogWatcher();
    window.wowarenalogs.logs?.removeAll_handleNewCombat_listeners();
    onClearCombats();
  };
}
