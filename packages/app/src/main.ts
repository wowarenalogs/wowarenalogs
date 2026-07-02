import { app, BrowserWindow, dialog, protocol } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import { autoUpdater } from 'electron-updater';
import { createReadStream, existsSync, statSync } from 'fs-extra';
import moment from 'moment';
import path from 'path';
import { Readable } from 'stream';

import { BASE_REMOTE_URL } from './constants';
import { logger } from './logger';
import { globalStates } from './nativeBridge/modules/common/globalStates';
import { flushAllLogParsers } from './nativeBridge/modules/logsModule';
import { nativeBridgeRegistry } from './nativeBridge/registry';

// Print versions because it's not always obvious what version of Node Electron is using
// eslint-disable-next-line no-console
console.log(process.versions);

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception in main process: ${error.message}`);
  if (error.stack) {
    logger.error(error.stack);
  }
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection in main process: ${String(reason)}`);
});

const MAX_RELOAD_DELAY_MS = 30000;
const FLUSH_QUIT_GRACE_MS = 1500;
let reloadAttempt = 0;
let reloadTimer: NodeJS.Timeout | undefined;

function loadRemoteApp(win: BrowserWindow) {
  if (reloadTimer) {
    clearTimeout(reloadTimer);
    reloadTimer = undefined;
  }
  win.loadURL(`${BASE_REMOTE_URL}/?time=${moment.now()}`, {
    extraHeaders: 'pragma: no-cache\n',
  });
}

function scheduleReload(win: BrowserWindow) {
  if (reloadTimer) {
    return;
  }
  reloadAttempt += 1;
  const delay = Math.min(1000 * 2 ** reloadAttempt, MAX_RELOAD_DELAY_MS);
  logger.info(`Scheduling app reload attempt ${reloadAttempt} in ${delay}ms`);
  reloadTimer = setTimeout(() => loadRemoteApp(win), delay);
}

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

  loadRemoteApp(win);

  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  win.webContents.on('did-finish-load', () => {
    if (win.webContents.getURL().startsWith(BASE_REMOTE_URL)) {
      reloadAttempt = 0;
    }
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 is ERR_ABORTED, which fires for routine navigations (e.g. a load getting
    // superseded by another) and is not a real failure.
    if (!isMainFrame || errorCode === -3) {
      return;
    }
    logger.error(`Renderer failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
    win.loadFile(path.join(__dirname, 'public', 'connection-error.html')).catch((e) => {
      logger.error(`Failed to load fallback error page: ${String(e)}`);
    });
    scheduleReload(win);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`Renderer process gone: reason=${details.reason} exitCode=${details.exitCode}`);
    scheduleReload(win);
  });

  win.webContents.on('did-frame-finish-load', () => {
    if (!app.isPackaged && win) {
      // DevTools
      installExtension(REACT_DEVELOPER_TOOLS);
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  protocol.handle('vod', async (request) => {
    try {
      const encodedFilename = decodeURIComponent(request.url.slice('vod://wowarenalogs/'.length));
      if (!encodedFilename) {
        return new Response('', { status: 404, statusText: 'Not Found' });
      }

      const filename = Buffer.from(encodedFilename, 'base64').toString('utf-8');
      if (!filename.endsWith('.mp4')) {
        return new Response('Only video files are allowed', { status: 400 });
      }
      if (!existsSync(filename)) {
        return new Response('', { status: 404, statusText: 'File Not Found' });
      }

      const stats = statSync(filename);
      const fileSize = stats.size;
      const rangeHeader = request.headers.get('Range');

      if (rangeHeader) {
        const rangeParts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(rangeParts[0], 10);
        const end = rangeParts[1] ? parseInt(rangeParts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        const stream = createReadStream(filename, { start, end });
        const body = Readable.toWeb(stream);

        return new Response(body as ReadableStream, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize.toString(),
            'Content-Type': 'video/mp4',
            'Cache-Control': 'no-cache',
          },
        });
      }

      const stream = createReadStream(filename);
      return new Response(stream as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Length': fileSize.toString(),
          'Accept-Ranges': 'bytes',
          'Content-Type': 'video/mp4',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      logger.error(`vod protocol error: ${String(error)}`);
      return new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });
    }
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
      autoUpdater.on('error', (error) => {
        logger.error(`AutoUpdater error: ${error.message}`);
        if (error.stack) {
          logger.error(`AutoUpdater error stack: ${error.stack}`);
        }
      });

      autoUpdater.on('checking-for-update', () => {
        logger.info('AutoUpdater: Checking for updates...');
      });

      autoUpdater.on('update-available', (info) => {
        logger.info(`AutoUpdater: Update available - version ${info.version}`);
      });

      autoUpdater.on('update-not-available', (info) => {
        logger.info(`AutoUpdater: No update available - current version ${info.version}`);
      });

      autoUpdater.on('download-progress', (progress) => {
        logger.info(`AutoUpdater: Download progress - ${progress.percent.toFixed(1)}%`);
      });

      autoUpdater.on('update-downloaded', (info) => {
        logger.info(`AutoUpdater: Update downloaded - version ${info.version}`);
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
      });

      autoUpdater.checkForUpdatesAndNotify();
    }

    app.on('second-instance', () => {
      if (!win.isVisible()) {
        win.show();
      }
      win.focus();
    });

    const startMinimized = (process.argv || []).indexOf('--hidden') !== -1;

    if (startMinimized) {
      win.minimize();
    }
  });

  let isQuittingAfterFlush = false;
  app.on('before-quit', (event) => {
    if (isQuittingAfterFlush) {
      return;
    }

    // The idle-timeout flush (READ_TIMEOUT_MS in logsModule) can't help here: it needs several
    // minutes to fire, and the app is about to exit right now. Flush synchronously so a match
    // that just ended isn't lost because its closing log line hadn't arrived yet, then hold the
    // quit briefly - flushing emits IPC events the renderer needs a moment to receive and act on
    // (e.g. kicking off the upload) before the window is torn down.
    event.preventDefault();
    isQuittingAfterFlush = true;
    flushAllLogParsers();
    setTimeout(() => app.quit(), FLUSH_QUIT_GRACE_MS);
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
