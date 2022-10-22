import { app, BrowserWindow } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import serve from 'electron-serve';
import path from 'path';

import { nativeBridgeRegistry } from './nativeBridge/registry';

serve({ directory: path.join(__dirname, 'desktop') });

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

  nativeBridgeRegistry.startListeners(win);

  if (app.isPackaged) {
    win.loadURL('app://-');
  } else {
    win.loadURL('http://localhost:3000');
  }

  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  win.webContents.on('did-frame-finish-load', () => {
    if (!app.isPackaged && win) {
      installExtension(REACT_DEVELOPER_TOOLS);
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  if (app.isPackaged) {
    require('update-electron-app')({
      repo: 'wowarenalogs/wowarenalogs',
      notifyUser: false,
    });
  }
}

app.on('ready', () => {
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
