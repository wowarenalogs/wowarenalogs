/* eslint-disable no-console */
// import { Manager } from '@wowarenalogs/recorder';
import { BrowserWindow } from 'electron';
import { existsSync, readdirSync } from 'fs';
import * as osn from 'obs-studio-node';
import path from 'path';
import { v4 as uuidfn } from 'uuid';

import { moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';

@nativeBridgeModule('obs')
export class ObsModule extends NativeBridgeModule {
  // private manager: Manager | null = null;

  public onRegistered(mainWindow: BrowserWindow): void {
    console.log('Manager registered');

    const __dirnameApple = __dirname + '/bin';
    // console.log('dircheck');
    // if (existsSync(path.resolve(__dirnameApple).replace('app.asar', 'app.asar.unpacked'))) {
    //   console.log('d1');
    //   osn.IPC.setServerPath(
    //     path.resolve(__dirnameApple, `obs64`).replace('app.asar', 'app.asar.unpacked'),
    //     path.resolve(__dirnameApple).replace('app.asar', 'app.asar.unpacked'),
    //   );
    // } else if (existsSync(path.resolve(__dirname, `obs64.exe`).replace('app.asar', 'app.asar.unpacked'))) {
    //   console.log('d2');
    //   osn.IPC.setServerPath(
    //     path.resolve(__dirname, `obs64.exe`).replace('app.asar', 'app.asar.unpacked'),
    //     path.resolve(__dirname).replace('app.asar', 'app.asar.unpacked'),
    //   );
    // } else {
    //   console.log('d3');
    //   console.log(
    //     path.resolve(__dirname, `obs32.exe`).replace('app.asar', 'app.asar.unpacked'),
    //     path.resolve(__dirname).replace('app.asar', 'app.asar.unpacked'),
    //   );
    //   osn.IPC.setServerPath(
    //     path.resolve(__dirname, `obs32.exe`).replace('app.asar', 'app.asar.unpacked'),
    //     path.resolve(__dirname).replace('app.asar', 'app.asar.unpacked'),
    //   );
    // }

    osn.IPC.setServerPath(
      `D:\\Github\\wowarenalogs\\node_modules\\obs-studio-node\\obs64.exe`,
      `D:\\Github\\wowarenalogs\\node_modules\\obs-studio-node`,
    );

    // this.manager = new Manager(mainWindow);
    try {
      const dirName = `D:\\Github\\wowarenalogs\\node_modules\\obs-studio-node`;
      const host = uuidfn();
      console.log('A');
      console.log(`host ${host}`);
      osn.NodeObs.IPC.host(host);
      console.log('B'); //packages\app\node_modules\obs-studio-node
      const dir = readdirSync(dirName);
      console.log(dir.length);
      console.log(dirName);
      osn.NodeObs.SetWorkingDirectory(dirName);
      console.log('C');
      //(this.language, this.obsPath, this.version, this.crashServer);
      const initResult = osn.NodeObs.OBS_API_initAPI('en-US', 'D:\\Video', '1.0.0');
      console.log('obs init', initResult);
    } catch (e) {
      console.log('err', e);
    }
  }

  @moduleFunction()
  public async startRecording(_mainWindow: BrowserWindow) {
    // this.manager?.recorder.start();
  }

  @moduleFunction()
  public async stopRecording(_mainWindow: BrowserWindow, _activityName: string) {
    // this.manager?.recorder.stop({
    //   startDate: new Date(),
    //   endDate: new Date(),
    //   metadata: {},
    //   overrun: 0,
    //   fileName: 'testFile',
    // });
  }
}
