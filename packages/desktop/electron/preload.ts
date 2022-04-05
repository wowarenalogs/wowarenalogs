import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// PRELOAD SHIM UNTIL WEBPACKING IS READY
// THESE BLOCKS COPIED FROM THEIR SOURCE IN MAIN-UTILS
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
// THESE BLOCKS COPIED FROM THEIR SOURCE IN MAIN-UTILS
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
// THESE BLOCKS COPIED FROM THEIR SOURCE IN MAIN-UTILS
// ExternalUrls
const externalUrlsEvents = {
  armoryLinkOpenedEvent: 'wal-open-armory-link',
};
const externalUrlsAPI = {
  openArmoryLink: (player: string) => ipcRenderer.invoke(externalUrlsEvents.armoryLinkOpenedEvent, player),
};

// PRELOAD SHIM UNTIL WEBPACKING IS READY
// THESE BLOCKS COPIED FROM THEIR SOURCE IN MAIN-UTILS
// FOLDERS API
const folderEvents = {
  getInstallationsInFolder: 'wal-get-all-installs',
};

const wowFolderApi = {
  getInstallationsInFolder: (path: string) => ipcRenderer.invoke(folderEvents.getInstallationsInFolder, path),
};

contextBridge.exposeInMainWorld('wowarenalogs', {
  urls: externalUrlsAPI,
  folders: foldersAPI,
  logger: bridgeAPI,
  wowFolder: wowFolderApi,
  environment: {
    getPlatform: () => process.platform,
  },
});
