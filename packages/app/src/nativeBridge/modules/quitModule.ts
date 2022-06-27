import { NativeBridgeModule } from '../module';
import { app } from 'electron';

export class QuitModule extends NativeBridgeModule {
  constructor() {
    super('quit');
  }

  public async handleMessageAsync(mainWindow: Electron.BrowserWindow): Promise<void> {
    app.quit();
  }

  public getInvokables() {
    return [];
  }
}
