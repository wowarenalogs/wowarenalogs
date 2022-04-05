import { BrowserWindow, contextBridge, ipcMain, IpcMainInvokeEvent, ipcRenderer } from 'electron';
import { existsSync, writeFile } from 'fs';
import { join } from 'path';
import { WowVersion } from 'wow-combat-log-parser';

import { DesktopUtils } from './index';

const bridgeState: {
  mainWindow?: BrowserWindow;
} = {
  mainWindow: undefined,
};

const Events = {
  getInstallationsInFolder: 'wal-get-all-installs',
  installAddon: 'wal-install-addon',
};

const wowFolderApi = {
  getInstallationsInFolder: (path: string) =>
    ipcRenderer.invoke(Events.getInstallationsInFolder, path) as Promise<ReturnType<typeof onGetInstalls>>,
  installAddon: (path: string) =>
    ipcRenderer.invoke(Events.installAddon, path) as Promise<ReturnType<typeof onInstallAddon>>,
};

export type WowFolderBridgeAPI = typeof wowFolderApi;

export class WowFolderBridge {
  // Should be integrated in preload.ts
  public static preloadBindings = () => {
    contextBridge.exposeInMainWorld('wowFolderBridge', wowFolderApi);
  };

  // Should be called in main.ts
  public static mainBindings = (mainWindow: BrowserWindow) => {
    bridgeState.mainWindow = mainWindow;
    ipcMain.handle(Events.getInstallationsInFolder, onGetInstalls);
    ipcMain.handle(Events.installAddon, onInstallAddon);
  };
}

function onGetInstalls(_event: IpcMainInvokeEvent, path: string): Map<WowVersion, string> {
  return DesktopUtils.getWowInstallsFromPath(path);
}

async function onInstallAddon(_event: IpcMainInvokeEvent, path: string): Promise<void> {
  const wowInstallations = DesktopUtils.getWowInstallsFromPath(path);
  for (const [ver, dir] of Array.from(wowInstallations.entries())) {
    const remoteAddonTOCResponse = await fetch(`/addon/${ver}/WoWArenaLogs.toc`);
    const remoteAddonTOC = await remoteAddonTOCResponse.text();

    const remoteAddonLUAResponse = await fetch(`/addon/${ver}/WoWArenaLogs.lua`);
    const remoteAddonLUA = await remoteAddonLUAResponse.text();

    const addonDestPath = join(dir, 'Interface/AddOns/WoWArenaLogs');
    // await ensureDir(addonDestPath); // TODO: REPLACE SHIM

    // await writeFile(join(addonDestPath, 'WoWArenaLogs.toc'), DesktopUtils.normalizeAddonContent(remoteAddonTOC), {
    //   encoding: 'utf-8',
    // });
    // await writeFile(join(addonDestPath, 'WoWArenaLogs.lua'), DesktopUtils.normalizeAddonContent(remoteAddonLUA), {
    //   encoding: 'utf-8',
    // });
  }
}
