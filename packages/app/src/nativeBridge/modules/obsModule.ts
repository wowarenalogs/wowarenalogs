/* eslint-disable no-console */
import { ArenaMatchEndInfo, ArenaMatchStartInfo, CombatResult, WowVersion } from '@wowarenalogs/parser';
import { ConfigurationSchema, IActivity, Manager, RecStatus } from '@wowarenalogs/recorder';
import { BrowserWindow, dialog } from 'electron';
import { readdir, readFile } from 'fs-extra';
import path from 'path';

import { moduleEvent, moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';

// TODO: MUSTFIX: copies!!!!
export interface IMetadata {
  dataType: 'ArenaMatchMetadata' | 'ShuffleMatchMetadata';
  startInfo: ArenaMatchStartInfo;
  endInfo: ArenaMatchEndInfo;
  wowVersion: WowVersion;
  id: string;
  timezone: string;
  startTime: number;
  endTime: number;
  playerId: string;
  playerTeamId: string;
  result: CombatResult;
  durationInSeconds: number;
  winningTeamId: string;
}

export interface ArenaMatchMetadata extends IMetadata {
  dataType: 'ArenaMatchMetadata';
}

export interface ShuffleMatchMetadata extends IMetadata {
  dataType: 'ShuffleMatchMetadata';
  roundStarts: {
    id: string;
    startInfo: ArenaMatchStartInfo;
    sequenceNumber: number;
  }[];
}

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

  public onRegistered(mainWindow: BrowserWindow): void {
    this.manager = new Manager(mainWindow);
    this.manager.subscribeToConfigurationUpdates((newValue, _oldValue) => {
      this.configUpdated(mainWindow, newValue);
    });
    this.manager.recorder.onStatusUpdates((status, err) => this.recorderStatusUpdated(mainWindow, status, err));
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
  public recorderStatusUpdated(_mainWindow: BrowserWindow, _status: RecStatus, _err?: string): void {
    return;
  }

  @moduleEvent('on')
  public configUpdated(_mainWindow: BrowserWindow, _newValue: Readonly<ConfigurationSchema> | undefined): void {
    return;
  }

  /**
   * A very hacky way to find if a match of a given id has a video file
   */
  @moduleFunction()
  public async findVideoForMatch(_mainWindow: BrowserWindow, configFolder: string, matchId: string) {
    const filesInFolder = await readdir(configFolder);
    const metadataFiles = filesInFolder.filter((f) => f.endsWith('.json'));
    for (let i = 0; i < metadataFiles.length; i++) {
      console.log('Reading', metadataFiles[i]);
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
