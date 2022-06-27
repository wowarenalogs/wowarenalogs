import { NativeBridgeModule } from '../module';
import { app } from 'electron';

export class ApplicationModule extends NativeBridgeModule {
  constructor() {
    super('app');
  }

  public async quit(_mainWindow: Electron.BrowserWindow): Promise<void> {
    app.quit();
  }

  public getInvokables() {
    return [
      {
        name: 'quit',
        invocation: this.quit,
      },
    ];
  }
}
