import { ConfigurationSchema, IActivity, Manager, RecStatus, VideoQueueItem } from '@wowarenalogs/recorder';
import type { ArenaMatchMetadata, ShuffleMatchMetadata } from '@wowarenalogs/shared';
import checkDiskSpace from 'check-disk-space';
import { BrowserWindow, dialog } from 'electron';
import { readdir, readFile } from 'fs-extra';
import path from 'path';

import { logger } from '../../logger';
import { moduleEvent, moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';
import { toDriveLabel } from './common/driveUtils';

const DISK_SPACE_THRESHOLD = 2e9; // ~2gb

// Static method to inject logger across OBS modules that will need it
Manager.configureLogging(logger);

@nativeBridgeModule('obs')
export class ObsModule extends NativeBridgeModule {
  private manager: Manager | null = null;
  private lifecycleTask: Promise<void> = Promise.resolve();
  private engineEnabled = false;

  private runLifecycleTask(task: () => Promise<void> | void): Promise<void> {
    const run = this.lifecycleTask.then(async () => {
      await task();
    });

    this.lifecycleTask = run.catch((error) => {
      logger.error(`[ObsModule] Lifecycle task failed: ${String(error)}`);
    });

    return run;
  }

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
  public async startRecordingEngine(mainWindow: BrowserWindow): Promise<void> {
    await this.runLifecycleTask(async () => {
      this.engineEnabled = true;
      if (this.manager) {
        await this.manager.resume();
        this.recorderStatusUpdated(mainWindow, this.manager.recorder.recorderStatus);
        return;
      }

      if (process.platform === 'win32') {
        this.manager = new Manager(mainWindow);
        this.manager.subscribeToConfigurationUpdates((newValue, _oldValue) => {
          this.configUpdated(mainWindow, newValue);
        });
        this.manager.recorder.onStatusUpdates((status, err) => this.recorderStatusUpdated(mainWindow, status, err));
        this.manager.recorder.onVolumeChange((type, sourceName, volume) =>
          this.audioVolumeChanged(mainWindow, type, sourceName, volume),
        );
        this.manager.messageBus.on('video-written', (video) => {
          this.videoRecorded(mainWindow, video);
          this.checkDiskSpace(mainWindow);
        });
      }
    });
  }

  @moduleFunction()
  public async startBuffer(_mainWindow: BrowserWindow): Promise<void> {
    if (!this.engineEnabled) return;
    await this.manager?.recorder.startBuffer();
  }

  @moduleFunction()
  public async stopRecordingEngine(mainWindow: BrowserWindow): Promise<void> {
    await this.runLifecycleTask(async () => {
      if (!this.manager) return;

      this.engineEnabled = false;
      this.manager.recorder.hidePreview();
      await this.manager.pause();
      this.recorderStatusUpdated(mainWindow, 'EngineNotStarted');
    });
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
  public async startRecording(_mainWindow: BrowserWindow, backtrackSeconds = 0) {
    if (!this.engineEnabled) return;
    this.manager?.recorder.start(backtrackSeconds);
  }

  @moduleFunction()
  public async stopRecording(_mainWindow: BrowserWindow, activity: IActivity) {
    if (!this.engineEnabled) return;
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
    if (!this.engineEnabled) return 'EngineNotStarted';
    return this.manager?.recorder.recorderStatus || 'EngineNotStarted';
  }

  @moduleEvent('on')
  public recorderStatusUpdated(
    _mainWindow: BrowserWindow,
    _status: RecStatus | 'EngineNotStarted',
    _err?: string,
  ): void {
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

  @moduleEvent('on')
  public diskSpaceBecameCritical(_mainWindow: BrowserWindow, _bytesRemaining: number, _driveLabel?: string) {
    return;
  }

  @moduleEvent('on')
  public audioVolumeChanged(
    _mainWindow: BrowserWindow,
    _type: 'input' | 'output',
    _sourceName: string,
    _volume: number,
  ) {
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

  /**
   * Check if user has < DISK_THRESHOLD space free
   */
  async checkDiskSpace(mainWindow: BrowserWindow) {
    if (this.manager?.getConfiguration().storagePath) {
      const storagePath = this.manager?.getConfiguration().storagePath;
      const details = await this.getDiskSpaceDetails(storagePath);
      if (details.free < DISK_SPACE_THRESHOLD) {
        // warn
        this.diskSpaceBecameCritical(mainWindow, details.free, toDriveLabel(storagePath, details.diskPath));
      }
    }
  }

  async getDiskSpaceDetails(path: string) {
    const details = await checkDiskSpace(path);
    return details;
  }
}
