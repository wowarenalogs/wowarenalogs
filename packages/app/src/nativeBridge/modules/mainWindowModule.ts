import { BrowserWindow } from 'electron';
import { NativeBridgeModule } from '../module';

const onWindowResized = 'onWindowResized';
const onWindowMoved = 'onWindowMoved';

export class MainWindowModule extends NativeBridgeModule {
  constructor() {
    super('win');
  }

  public async isMaximized(mainWindow: BrowserWindow): Promise<boolean> {
    return mainWindow.isMaximized();
  }

  public async isMinimized(mainWindow: BrowserWindow): Promise<boolean> {
    return mainWindow.isMinimized();
  }

  public async minimize(mainWindow: BrowserWindow): Promise<void> {
    mainWindow.minimize();
  }

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

  public async setWindowSize(mainWindow: BrowserWindow, width: number, height: number) {
    mainWindow.setSize(width, height);
  }

  public async setWindowPosition(mainWindow: BrowserWindow, x: number, y: number) {
    mainWindow.setPosition(x, y);
  }

  public onRegistered(mainWindow: BrowserWindow): void {
    mainWindow.on('resize', () => {
      mainWindow.webContents.send(this.getEventKey(onWindowResized));
    });
    mainWindow.on('move', () => {
      mainWindow.webContents.send(this.getEventKey(onWindowMoved));
    });
  }

  public getInvokables() {
    return [
      {
        name: 'setWindowPosition',
        invocation: this.setWindowPosition,
      },
      {
        name: 'setWindowSize',
        invocation: this.setWindowSize,
      },
      {
        name: 'isMaximized',
        invocation: this.isMaximized,
      },
      {
        name: 'isMinimized',
        invocation: this.isMinimized,
      },
      {
        name: 'minimize',
        invocation: this.minimize,
      },
      {
        name: 'maximize',
        invocation: this.maximize,
      },
    ];
  }
}
