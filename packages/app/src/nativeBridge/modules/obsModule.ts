import { Recorder } from '@wowarenalogs/recorder';
import { BrowserWindow } from 'electron';

import { moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';

let recorder: Recorder;

@nativeBridgeModule('obs')
export class ObsModule extends NativeBridgeModule {
  @moduleFunction()
  public async startOBSRecorder(mainWindow: BrowserWindow) {
    recorder = new Recorder(mainWindow);
    return;
  }

  @moduleFunction()
  public async startRecording(_mainWindow: BrowserWindow) {
    recorder.start();
  }

  @moduleFunction()
  public async stopRecording(_mainWindow: BrowserWindow, _activityName: string) {
    recorder.stop({
      startDate: new Date(),
      endDate: new Date(),
      metadata: {},
      overrun: 0,
      fileName: 'testFile',
    });
  }
}
