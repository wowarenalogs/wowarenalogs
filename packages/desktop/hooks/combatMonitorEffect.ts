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
    onNewCombatEnded(combat);
  });

  return () => {
    // TODO: also unregister handleNewCombat handler when we stop the watcher...
    window.wowarenalogs.logs?.stopLogWatcher();
    onClearCombats();
  };
}
