import { NativeBridgeModule } from '../module';
import { app } from 'electron';

export class ApplicationModule extends NativeBridgeModule {
  constructor() {
    super('app');
  }

  public async quit(_mainWindow: Electron.BrowserWindow): Promise<void> {
    app.quit();
  }

  public async getPlatform(
    _mainWindow: Electron.BrowserWindow,
  ): Promise<
    'aix' | 'android' | 'darwin' | 'freebsd' | 'haiku' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd'
  > {
    return Promise.resolve(process.platform);
  }

  public getInvokables() {
    return [
      {
        name: 'quit',
        invocation: this.quit,
      },
      {
        name: 'getPlatform',
        invocation: this.getPlatform,
      },
    ];
  }
}
