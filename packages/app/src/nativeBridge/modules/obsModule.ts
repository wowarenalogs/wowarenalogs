/* eslint-disable no-console */
import { ConfigurationSchema, IActivity, Manager } from '@wowarenalogs/recorder';
import { BrowserWindow } from 'electron';

import { moduleEvent, moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';

@nativeBridgeModule('obs')
export class ObsModule extends NativeBridgeModule {
  private manager: Manager | null = null;

  public onRegistered(mainWindow: BrowserWindow): void {
    this.manager = new Manager(mainWindow);
    this.manager.subscribeToConfigurationUpdates((newValue, _oldValue) => {
      console.log('inte');
      console.log(newValue, _oldValue);
      this.configUpdated(mainWindow, newValue);
    });
  }

  @moduleFunction()
  public async startRecording(_mainWindow: BrowserWindow) {
    this.manager?.recorder.start();
  }

  @moduleFunction()
  public async stopRecording(_mainWindow: BrowserWindow, activity: IActivity) {
    this.manager?.recorder.stop(activity);
  }

  @moduleFunction()
  public async getConfiguration(_mainWindow: BrowserWindow) {
    return this.manager?.getConfiguration();
  }

  @moduleFunction()
  public async setConfig(
    _mainWindow: BrowserWindow,
    configKey: keyof ConfigurationSchema,
    configValue: number | boolean | string,
  ) {
    this.manager?.setConfigurationValue(configKey, configValue);
  }

  @moduleFunction()
  public async getAudioDevices(_mainWindowL: BrowserWindow) {
    return this.manager?.getAudioDevices();
  }

  @moduleEvent('on')
  public configUpdated(_mainWindow: BrowserWindow, _newValue: Readonly<ConfigurationSchema> | undefined): void {
    return;
  }
}
