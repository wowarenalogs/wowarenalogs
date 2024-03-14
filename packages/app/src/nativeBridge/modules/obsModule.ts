import { ConfigurationSchema, IActivity, Manager, Recorder, RecStatus, VideoQueueItem } from '@wowarenalogs/recorder';
import type { ArenaMatchMetadata, ShuffleMatchMetadata } from '@wowarenalogs/shared';
import { BrowserWindow, dialog } from 'electron';
import { readdir, readFile } from 'fs-extra';
import path from 'path';

import { logger } from '../../logger';
import { moduleEvent, moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';

// Static method to inject logger across OBS modules that will need it
Manager.configureLogging(logger);

@nativeBridgeModule('obs')
export class ObsModule extends NativeBridgeModule {
  private manager: Manager | null = null;

  @moduleFunction()
  public async selectFolder(_mainWindow: BrowserWindow, title: string) {
    const dialogResult = await dialog.showOpenDialog({
      title,
      buttonLabel: 'Select',
      properties: ['openDirectory', 'createDirectory'],
    });
    return dialogResult.filePaths;
  }

  @moduleFunction()
  public startRecordingEngine(mainWindow: BrowserWindow): void {
    if (this.manager) return;

    if (process.platform === 'win32') {
      Recorder.loadOBSLibraries().then(() => {
        this.manager = new Manager(mainWindow);
        this.manager.subscribeToConfigurationUpdates((newValue, _oldValue) => {
          this.configUpdated(mainWindow, newValue);
        });
        this.manager.recorder.onStatusUpdates((status, err) => this.recorderStatusUpdated(mainWindow, status, err));
        this.manager.messageBus.on('video-written', (video) => {
          this.videoRecorded(mainWindow, video);
        });
      });
    }
  }

  @moduleFunction()
  public stopRecordingEngine(_mainWindow: BrowserWindow): void {
    if (!this.manager) return;

    this.manager.recorder.hidePreview();
    this.manager.messageBus.removeAllListeners();
    this.manager.recorder.shutdownOBS();
    this.manager = null;
  }

  @moduleFunction()
  public async drawPreviewWindow(
    _mainWindow: BrowserWindow,
    width: number,
    height: number,
    xPos: number,
    yPos: number,
  ) {
    this.manager?.recorder.showPreview(width, height, xPos, yPos);
  }

  @moduleFunction()
  public async hidePreviewWindow(_mainWindow: BrowserWindow) {
    this.manager?.recorder.hidePreview();
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

  @moduleFunction()
  public async getRecorderStatus(_mainWindow: BrowserWindow) {
    return this.manager?.recorder.recorderStatus || 'EngineNotStarted';
  }

  @moduleEvent('on')
  public recorderStatusUpdated(_mainWindow: BrowserWindow, _status: RecStatus, _err?: string): void {
    return;
  }

  @moduleEvent('on')
  public configUpdated(_mainWindow: BrowserWindow, _newValue: Readonly<ConfigurationSchema> | undefined): void {
    return;
  }

  @moduleEvent('on')
  public videoRecorded(_mainWindow: BrowserWindow, _video: VideoQueueItem) {
    return;
  }

  @moduleFunction()
  public async getEncoders(_mainWindow: BrowserWindow) {
    return this.manager?.getAvailableEncoders();
  }

  /**
   * A very hacky way to find if a match of a given id has a video file
   */
  @moduleFunction()
  public async findVideoForMatch(_mainWindow: BrowserWindow, configFolder: string, matchId: string) {
    const filesInFolder = await readdir(configFolder);
    const metadataFiles = filesInFolder.filter((f) => f.endsWith('.json'));
    for (let i = 0; i < metadataFiles.length; i++) {
      const fino = await readFile(path.join(configFolder, metadataFiles[i]));
      if (fino.includes(matchId)) {
        return JSON.parse(fino.toString()) as {
          videoPath: string;
          metadata: ArenaMatchMetadata | ShuffleMatchMetadata;
        };
      }
    }
  }
}
