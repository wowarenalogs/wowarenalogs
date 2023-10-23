import { app, BrowserWindow, dialog } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import { autoUpdater } from 'electron-updater';
import moment from 'moment';

import { nativeBridgeRegistry } from './nativeBridge/registry';

import path = require('path');
import { BASE_REMOTE_URL } from './constants';
import { globalStates } from './nativeBridge/modules/common/globalStates';

function createWindow() {
  const preloadScriptPath = path.join(__dirname, 'preload.bundle.js');

  const win = new BrowserWindow({
    title: 'WoW Arena Logs',
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'public', 'icon.png'),
    frame: false,
    backgroundColor: '#000000',
    width: 1120,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadScriptPath,
    },
  });

  win.setMinimumSize(1120, 600);
  win.setMenuBarVisibility(false);

  win.loadURL(`${BASE_REMOTE_URL}/?time=${moment.now()}`, {
    extraHeaders: 'pragma: no-cache\n',
  });

  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  win.webContents.on('did-frame-finish-load', () => {
    if (!app.isPackaged && win) {
      // DevTools
      installExtension(REACT_DEVELOPER_TOOLS);
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  nativeBridgeRegistry.startListeners(win);

  return win;
}

const isFirstInstance = app.requestSingleInstanceLock();

if (!isFirstInstance) {
  app.quit();
} else {
  app.on('ready', () => {
    const win = createWindow();

    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify().then((result) => {
        if (result && result.updateInfo.version !== app.getVersion()) {
          globalStates.isUpdateAvailable = true;

          dialog
            .showMessageBox(win, {
              type: 'question',
              buttons: ['Update Now', 'Skip'],
              defaultId: 0,
              title: 'Update Available',
              message: 'A new version of the app is available. Would you like to update now?',
            })
            .then((response) => {
              if (response.response === 0) {
                autoUpdater.quitAndInstall();
              }
            });
        }
      });
    }

    app.on('second-instance', () => {
      if (!win.isVisible()) {
        win.show();
      }
      win.focus();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
