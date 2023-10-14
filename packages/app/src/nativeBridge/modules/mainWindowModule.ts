import { app, BrowserWindow, Menu, Tray } from 'electron';
import path from 'path';

import { moduleEvent, moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';

@nativeBridgeModule('win')
export class MainWindowModule extends NativeBridgeModule {
  private trayIcon: Tray | null = null;

  @moduleFunction({ isRequired: true })
  public async isMaximized(mainWindow: BrowserWindow): Promise<boolean> {
    return mainWindow.isMaximized();
  }

  @moduleFunction({ isRequired: true })
  public async isMinimized(mainWindow: BrowserWindow): Promise<boolean> {
    return mainWindow.isMinimized();
  }

  @moduleFunction({ isRequired: true })
  public async minimize(mainWindow: BrowserWindow): Promise<void> {
    mainWindow.minimize();
  }

  @moduleFunction({ isRequired: true })
  public async maximize(mainWindow: BrowserWindow, maximize?: boolean): Promise<void> {
    if (maximize === undefined) {
      maximize = true;
    }

    if (maximize) {
      mainWindow.maximize();
    } else {
      mainWindow.unmaximize();
    }
  }

  @moduleFunction({ isRequired: true })
  public async hideToSystemTray(mainWindow: BrowserWindow): Promise<void> {
    mainWindow.hide();
  }

  @moduleFunction({ isRequired: true })
  public async setWindowSize(mainWindow: BrowserWindow, width: number, height: number) {
    mainWindow.setSize(width, height);
  }

  @moduleFunction({ isRequired: true })
  public async setWindowPosition(mainWindow: BrowserWindow, x: number, y: number) {
    mainWindow.setPosition(x, y);
  }

  @moduleFunction({ isRequired: true })
  public async getWindowPosition(mainWindow: BrowserWindow) {
    return mainWindow.getPosition();
  }

  @moduleFunction({ isRequired: true })
  public async getWindowSize(mainWindow: BrowserWindow) {
    return mainWindow.getSize();
  }

  public onRegistered(mainWindow: BrowserWindow): void {
    mainWindow.on('resize', () => {
      const [w, h] = mainWindow.getSize();
      this.onWindowResized(mainWindow, w, h);
    });
    mainWindow.on('move', () => {
      const [x, y] = mainWindow.getPosition();
      this.onWindowMoved(mainWindow, x, y);
    });

    try {
      this.trayIcon = new Tray(path.resolve(__dirname, 'public/icon.ico'));
      const trayMenu = Menu.buildFromTemplate([
        {
          label: 'Show',
          click: () => {
            mainWindow.show();
          },
        },
        {
          label: 'Quit',
          click: () => {
            app.quit();
          },
        },
      ]);
      this.trayIcon.setContextMenu(trayMenu);
      this.trayIcon.setToolTip('WoW Arena Logs');
      this.trayIcon.on('click', () => {
        mainWindow.show();
      });
    } catch (e) {
      console.error(e);
    }
  }

  @moduleEvent('on', { isRequired: true })
  public onWindowResized(_mainWindow: BrowserWindow, _w: number, _h: number): void {
    return;
  }

  @moduleEvent('on', { isRequired: true })
  public onWindowMoved(_mainWindow: BrowserWindow, _x: number, _y: number): void {
    return;
  }
}
