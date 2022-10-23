import { app, BrowserWindow } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import moment from 'moment';

import { nativeBridgeRegistry } from './nativeBridge/registry';

import path = require('path');
import { BASE_REMOTE_URL } from './constants';

function createWindow() {
  const preloadScriptPath = path.join(__dirname, 'preload.bundle.js');

  const win = new BrowserWindow({
    frame: false,
    backgroundColor: '#000000',
    width: 800,
    height: 640,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadScriptPath,
    },
  });

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
}

if (app.isPackaged) {
  require('update-electron-app')({
    repo: 'wowarenalogs/wowarenalogs',
    notifyUser: false,
  });
}

app.on('ready', () => {
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
