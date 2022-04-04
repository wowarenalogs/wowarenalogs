import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// PRELOAD SHIM UNTIL WEBPACKING IS READY
// FolderSelectBridge.preloadBindings();
const Events = {
  newFolderSelectedEvent: 'wal-new-folder-selected',
  showFolderSelectDialogEvent: 'wal-show-fs-dialog-event',
};
const foldersAPI = {
  handleFolderSelected: (callback: (event: IpcRendererEvent, d: string) => void) =>
    ipcRenderer.on(Events.newFolderSelectedEvent, callback),
  startLogWatcher: () => ipcRenderer.invoke(Events.showFolderSelectDialogEvent),
};

// PRELOAD SHIM UNTIL WEBPACKING IS READY
// LoggerBridge.preloadBindings();
const loggerEvents = {
  newCombatEvent: 'wal-new-combat',
  startLogWatcher: 'wal-start-log-watcher',
  stopLogWatcher: 'wal-stop-log-watcher',
};
const bridgeAPI = {
  handleNewCombat: (callback: (event: IpcRendererEvent, c: any) => void) =>
    ipcRenderer.on(loggerEvents.newCombatEvent, callback),
  startLogWatcher: (wowDirectory: string, wowVersion: any) =>
    ipcRenderer.invoke(loggerEvents.startLogWatcher, wowDirectory, wowVersion),
  stopLogWatcher: () => ipcRenderer.invoke(loggerEvents.stopLogWatcher),
};

// PRELOAD SHIM UNTIL WEBPACKING IS READY
// ExternalUrls
const externalUrlsEvents = {
  armoryLinkOpenedEvent: 'wal-open-armory-link',
};
const externalUrlsAPI = {
  openArmoryLink: (player: string) => ipcRenderer.invoke(externalUrlsEvents.armoryLinkOpenedEvent, player),
};

contextBridge.exposeInMainWorld('wowarenalogs', {
  urls: externalUrlsAPI,
  folders: foldersAPI,
  logger: bridgeAPI,
  environment: {
    getPlatform: () => process.platform,
  },
});
