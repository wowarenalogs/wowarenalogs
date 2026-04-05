import { app, BrowserWindow, dialog, protocol, utilityProcess } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import { autoUpdater } from 'electron-updater';
import { createReadStream, existsSync, statSync } from 'fs-extra';
import moment from 'moment';
import * as net from 'net';
import path from 'path';
import { Readable } from 'stream';

import { BASE_REMOTE_URL, NEXT_SERVER_PORT } from './constants';
import { logger } from './logger';
import { globalStates } from './nativeBridge/modules/common/globalStates';
import { nativeBridgeRegistry } from './nativeBridge/registry';

// Print versions because it's not always obvious what version of Node Electron is using
// eslint-disable-next-line no-console
console.log(process.versions);

function waitForPort(port: number, timeoutMs = 30000): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (Date.now() > deadline) {
        resolve(false);
        return;
      }
      const socket = net.createConnection(port, '127.0.0.1');
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => {
        setTimeout(check, 200);
      });
    };
    check();
  });
}

function startNextServer(): void {
  if (!app.isPackaged) return;

  const serverPath = path.join(process.resourcesPath, 'server', 'packages', 'web', 'server.js');
  logger.info(`Starting Next.js server from ${serverPath}`);

  if (!existsSync(serverPath)) {
    logger.error(`Next.js server not found at ${serverPath}`);
    return;
  }

  const child = utilityProcess.fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: String(NEXT_SERVER_PORT),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      NEXTAUTH_URL: `http://127.0.0.1:${NEXT_SERVER_PORT}`,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'local-personal-build-secret',
    },
    cwd: path.join(process.resourcesPath, 'server'),
    stdio: 'pipe',
  });

  child.stdout?.on('data', (data: Buffer) => {
    logger.info(`[next-server] ${data.toString().trim()}`);
  });

  child.stderr?.on('data', (data: Buffer) => {
    logger.error(`[next-server] ${data.toString().trim()}`);
  });

  child.on('exit', (code) => {
    logger.error(`Next.js server exited with code ${code}`);
  });
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

  if (!app.isPackaged) {
    win.loadURL(`${BASE_REMOTE_URL}/?time=${moment.now()}`, {
      extraHeaders: 'pragma: no-cache\n',
    });
  } else {
    // Show a blank loading screen while waiting for the local Next.js server
    win.loadURL(`data:text/html,<html style="background:#000"></html>`);
  }

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
  app.on('ready', async () => {
    startNextServer();
    const win = createWindow();

    if (app.isPackaged) {
      logger.info(`Waiting for Next.js server on port ${NEXT_SERVER_PORT}...`);
      const ready = await waitForPort(NEXT_SERVER_PORT);
      if (ready) {
        logger.info('Next.js server ready, loading app');
        win.loadURL(`${BASE_REMOTE_URL}/?time=${moment.now()}`, { extraHeaders: 'pragma: no-cache\n' });
      } else {
        logger.error('Next.js server did not start within 30s');
        win.loadURL(
          `data:text/html,<h2 style="font-family:sans-serif;padding:2rem">Failed to start local server. Check logs at %APPDATA%\\WoW Arena Logs\\log.txt</h2>`,
        );
      }
    }

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

  app.on('window-all-closed', () => {
    app.quit();
  });
}
