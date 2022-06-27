import { BrowserWindow } from 'electron';
import { NativeBridgeModule } from '../module';

export class IsMainWindowMaximizedModule extends NativeBridgeModule {
  constructor() {
    super('isWinMax');
  }

  public async getWindowMaximized(mainWindow: BrowserWindow): Promise<boolean> {
    return mainWindow.isMaximized();
  }

  public getInvokables() {
    return [
      {
        name: 'isMainWindowMaximized',
        invocation: this.getWindowMaximized,
      },
    ];
  }
}
