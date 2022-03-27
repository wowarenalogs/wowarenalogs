import { app, BrowserWindow, ipcMain } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import * as isDev from 'electron-is-dev';
import * as moment from 'moment';
import * as path from 'path';

import { IPC_GET_APP_IS_PACKAGED_SYNC, IPC_GET_PLATFORM_SYNC } from '../ipcEventNames';

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    frame: false,
    backgroundColor: '#000000',
    width: 1000,
    height: 640,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
    },
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL('http://localhost:3000/index.html');
  } else {
    win.loadURL(`https://desktop-client.wowarenalogs.com/index.html?time=${moment.now()}`, {
      extraHeaders: 'pragma: no-cache\n',
    });
  }

  win.on('closed', () => (win = null));

  // Hot Reloading
  if (isDev) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, '..', '..', 'node_modules', '.bin', 'electron'),
      forceHardReset: true,
      hardResetMethod: 'exit',
    });
  }

  win.webContents.on('new-window', function (e, u) {
    e.preventDefault();
  });

  win.webContents.on('did-frame-finish-load', () => {
    // DevTools
    installExtension(REACT_DEVELOPER_TOOLS)
      .then((name) => console.log(`Added Extension:  ${name}`))
      .catch((err) => console.log('An error occurred: ', err));

    if (isDev && win) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});

ipcMain.on(IPC_GET_PLATFORM_SYNC, (event) => {
  event.returnValue = process.platform;
});

ipcMain.on(IPC_GET_APP_IS_PACKAGED_SYNC, (event) => {
  event.returnValue = app.isPackaged;
});
