import { app, BrowserWindow, dialog, protocol } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import { autoUpdater } from 'electron-updater';
import { closeSync, openSync, readSync, statSync } from 'fs-extra';
import moment from 'moment';
import path from 'path';

import { BASE_REMOTE_URL } from './constants';
import { globalStates } from './nativeBridge/modules/common/globalStates';
import { nativeBridgeRegistry } from './nativeBridge/registry';

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

  protocol.handle('vod', async (request) => {
    const encodedFilename = decodeURI(request.url.slice('vod://wowarenalogs/'.length, request.url.length));

    const filename = atob(encodedFilename);
    if (!filename.endsWith('.mp4')) {
      return new Response('Only video files are allowed', { status: 400 });
    }

    const rangeReq = request.headers.get('Range') || 'bytes=0-';
    const parts = rangeReq.split('=');
    const numbers = parts[1].split('-').map((p) => parseInt(p));

    const fp = openSync(filename, 'r');
    const size = 2500000; // ~2.5mb chunks
    const start = numbers[0] || 0;
    const buffer = Buffer.alloc(size);
    readSync(fp, buffer, 0, size, start);

    const stats = statSync(filename);
    const totalSize = stats.size;
    closeSync(fp);

    return new Response(buffer, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Length': `${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${totalSize}`,
      },
    });
  });

  nativeBridgeRegistry.startListeners(win);

  return win;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vod',
    privileges: {
      bypassCSP: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
  },
]);

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
