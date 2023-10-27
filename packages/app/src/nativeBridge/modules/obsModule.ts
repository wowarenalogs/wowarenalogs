/* eslint-disable no-console */
import { Manager } from '@wowarenalogs/recorder';
import { BrowserWindow } from 'electron';

import { moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';

@nativeBridgeModule('obs')
export class ObsModule extends NativeBridgeModule {
  private manager: Manager | null = null;

  public onRegistered(mainWindow: BrowserWindow): void {
    console.log('Manager registered');
    this.manager = new Manager(mainWindow);
  }

  @moduleFunction()
  public async startRecording(_mainWindow: BrowserWindow) {
    this.manager?.recorder.start();
  }

  @moduleFunction()
  public async stopRecording(_mainWindow: BrowserWindow, _activityName: string) {
    this.manager?.recorder.stop({
      startDate: new Date(),
      endDate: new Date(),
      metadata: {},
      overrun: 0,
      fileName: 'testFile',
    });
  }
}
