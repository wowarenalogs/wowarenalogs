import * as moment from 'moment';

import { BrowserWindow, app } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    frame: false,
    backgroundColor: '#000000',
    width: 800,
    height: 640,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setMenuBarVisibility(false);

  if (!app.isPackaged) {
    win.loadURL('http://localhost:3000/');
  } else {
    win.loadURL(`https://desktop.wowarenalogs.com/?time=${moment.now()}`, {
      extraHeaders: 'pragma: no-cache\n',
    });
  }

  win.on('closed', () => (win = null));

  win.webContents.on('new-window', function (e, u) {
    e.preventDefault();
  });

  win.webContents.on('did-frame-finish-load', () => {
    // DevTools
    installExtension(REACT_DEVELOPER_TOOLS)
      .then((name) => console.log(`Added Extension:  ${name}`))
      .catch((err) => console.log('An error occurred: ', err));

    if (!app.isPackaged && win) {
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
