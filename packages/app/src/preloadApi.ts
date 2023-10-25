/* eslint-disable @typescript-eslint/no-explicit-any */
import { ipcRenderer, IpcRendererEvent } from 'electron';

export const modulesApi = {
  logs: {
    importLogFiles: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:logs:importLogFiles', ...args),
    startLogWatcher: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:logs:startLogWatcher', ...args),
    stopLogWatcher: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:logs:stopLogWatcher', ...args),
    handleActivityStarted: (callback: (event: IpcRendererEvent, ...args: any[]) => void) =>
      ipcRenderer.on('wowarenalogs:logs:handleActivityStarted', callback),
    removeAll_handleActivityStarted_listeners: () =>
      ipcRenderer.removeAllListeners('wowarenalogs:logs:handleActivityStarted'),
    handleNewCombat: (callback: (event: IpcRendererEvent, ...args: any[]) => void) =>
      ipcRenderer.on('wowarenalogs:logs:handleNewCombat', callback),
    removeAll_handleNewCombat_listeners: () => ipcRenderer.removeAllListeners('wowarenalogs:logs:handleNewCombat'),
    handleSoloShuffleRoundEnded: (callback: (event: IpcRendererEvent, ...args: any[]) => void) =>
      ipcRenderer.on('wowarenalogs:logs:handleSoloShuffleRoundEnded', callback),
    removeAll_handleSoloShuffleRoundEnded_listeners: () =>
      ipcRenderer.removeAllListeners('wowarenalogs:logs:handleSoloShuffleRoundEnded'),
    handleSoloShuffleEnded: (callback: (event: IpcRendererEvent, ...args: any[]) => void) =>
      ipcRenderer.on('wowarenalogs:logs:handleSoloShuffleEnded', callback),
    removeAll_handleSoloShuffleEnded_listeners: () =>
      ipcRenderer.removeAllListeners('wowarenalogs:logs:handleSoloShuffleEnded'),
    handleMalformedCombatDetected: (callback: (event: IpcRendererEvent, ...args: any[]) => void) =>
      ipcRenderer.on('wowarenalogs:logs:handleMalformedCombatDetected', callback),
    removeAll_handleMalformedCombatDetected_listeners: () =>
      ipcRenderer.removeAllListeners('wowarenalogs:logs:handleMalformedCombatDetected'),
    handleParserError: (callback: (event: IpcRendererEvent, ...args: any[]) => void) =>
      ipcRenderer.on('wowarenalogs:logs:handleParserError', callback),
    removeAll_handleParserError_listeners: () => ipcRenderer.removeAllListeners('wowarenalogs:logs:handleParserError'),
  },
  bnet: { login: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:bnet:login', ...args) },
  fs: {
    selectFolder: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:fs:selectFolder', ...args),
    getAllWoWInstallations: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:fs:getAllWoWInstallations', ...args),
    installAddon: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:fs:installAddon', ...args),
  },
  links: { openExternalURL: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:links:openExternalURL', ...args) },
  win: {
    isMaximized: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:win:isMaximized', ...args),
    isMinimized: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:win:isMinimized', ...args),
    minimize: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:win:minimize', ...args),
    maximize: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:win:maximize', ...args),
    hideToSystemTray: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:win:hideToSystemTray', ...args),
    setWindowSize: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:win:setWindowSize', ...args),
    setWindowPosition: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:win:setWindowPosition', ...args),
    getWindowPosition: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:win:getWindowPosition', ...args),
    getWindowSize: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:win:getWindowSize', ...args),
    onWindowResized: (callback: (event: IpcRendererEvent, ...args: any[]) => void) =>
      ipcRenderer.on('wowarenalogs:win:onWindowResized', callback),
    removeAll_onWindowResized_listeners: () => ipcRenderer.removeAllListeners('wowarenalogs:win:onWindowResized'),
    onWindowMoved: (callback: (event: IpcRendererEvent, ...args: any[]) => void) =>
      ipcRenderer.on('wowarenalogs:win:onWindowMoved', callback),
    removeAll_onWindowMoved_listeners: () => ipcRenderer.removeAllListeners('wowarenalogs:win:onWindowMoved'),
  },
  app: {
    quit: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:app:quit', ...args),
    setOpenAtLogin: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:app:setOpenAtLogin', ...args),
    getIsPackaged: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:app:getIsPackaged', ...args),
    getVersion: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:app:getVersion', ...args),
    isUpdateAvailable: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:app:isUpdateAvailable', ...args),
    clearStorage: (...args: any[]) => ipcRenderer.invoke('wowarenalogs:app:clearStorage', ...args),
  },
};
