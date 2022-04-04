import {
  BrowserWindow,
  contextBridge,
  dialog,
  ipcMain,
  IpcMainInvokeEvent,
  ipcRenderer,
  IpcRendererEvent,
} from 'electron';
import { dirname } from 'path';

import { DesktopUtils } from './index';

const bridgeState: {
  mainWindow?: BrowserWindow;
} = {
  mainWindow: undefined,
};

type Codex = {
  ['setup-page-locate-wow-mac']: string;
  ['setup-page-locate-wow-windows']: string;
  ['setup-page-invalid-location']: string;
  ['setup-page-invalid-location-message']: string;
  ['confirm']: string;
};

const Events = {
  newFolderSelectedEvent: 'wal-new-folder-selected',
  showFolderSelectDialogEvent: 'wal-show-fs-dialog-event',
};

const foldersAPI = {
  handleFolderSelected: (callback: (event: IpcRendererEvent, d: string) => void) =>
    ipcRenderer.on(Events.newFolderSelectedEvent, callback),
  startLogWatcher: () => ipcRenderer.invoke(Events.showFolderSelectDialogEvent),
};

export class FolderSelectBridge {
  // Should be integrated in preload.ts
  public static preloadBindings = () => {
    contextBridge.exposeInMainWorld('folderSelectBridge', foldersAPI);
  };

  // Should be called in main.ts
  public static mainBindings = (mainWindow: BrowserWindow) => {
    bridgeState.mainWindow = mainWindow;
    ipcMain.handle(Events.showFolderSelectDialogEvent, onShowDialog);
  };
}

function onShowDialog(_event: IpcMainInvokeEvent, codex: Codex) {
  dialog
    .showOpenDialog({
      title:
        process.platform === 'darwin' ? codex['setup-page-locate-wow-mac'] : codex['setup-page-locate-wow-windows'],
      buttonLabel: codex['confirm'],
      properties: ['openFile'],
      filters: [
        {
          name: process.platform === 'darwin' ? 'World of Warcraft.app' : 'Wow.exe, WowClassic.exe',
          extensions: [process.platform === 'darwin' ? 'app' : 'exe'],
        },
      ],
    })
    .then((data) => {
      if (!data.canceled && data.filePaths.length > 0) {
        const wowExePath = data.filePaths[0];
        const wowDirectory = dirname(wowExePath);
        const wowInstallations = DesktopUtils.getAllWoWInstallations(wowDirectory, process.platform);
        if (wowInstallations.size > 0) {
          bridgeState.mainWindow?.webContents.send(Events.newFolderSelectedEvent, wowDirectory);
          DesktopUtils.installAddon(wowInstallations);
        } else {
          dialog.showMessageBox({
            title: codex['setup-page-invalid-location'],
            message: codex['setup-page-invalid-location-message'],
            type: 'error',
          });
        }
      }
    });
}

export type FolderSelectBridgeWindowAPI = typeof foldersAPI;
