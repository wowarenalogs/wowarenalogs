import path from 'path';

import ConfigService from './configService';
import { ObsAudioConfig, ObsBaseConfig, ObsOverlayConfig, ObsVideoConfig, StorageConfig } from './types';

const getStorageConfig = (cfg: ConfigService): StorageConfig => {
  return {
    storagePath: cfg.get<string>('storagePath'),
  };
};

const getObsBaseConfig = (cfg: ConfigService): ObsBaseConfig => {
  const storagePath = cfg.getPath('storagePath');
  let bufferPath: string;

  if (cfg.get<boolean>('separateBufferPath')) {
    bufferPath = cfg.getPath('bufferStoragePath');
  } else {
    bufferPath = path.join(storagePath, '.temp');
  }

  return {
    bufferStoragePath: bufferPath,
    obsOutputResolution: cfg.get<string>('obsOutputResolution'),
    obsFPS: cfg.get<number>('obsFPS'),
    obsKBitRate: cfg.get<number>('obsKBitRate'),
    obsRecEncoder: cfg.get<string>('obsRecEncoder'),
  };
};

const getObsVideoConfig = (cfg: ConfigService): ObsVideoConfig => {
  return {
    obsCaptureMode: cfg.get<string>('obsCaptureMode'),
    monitorIndex: cfg.get<number>('monitorIndex'),
    captureCursor: cfg.get<boolean>('captureCursor'),
  };
};

const getObsAudioConfig = (cfg: ConfigService): ObsAudioConfig => {
  return {
    audioInputDevices: cfg.get<string>('audioInputDevices'),
    audioOutputDevices: cfg.get<string>('audioOutputDevices'),
    obsForceMono: cfg.get<boolean>('obsForceMono'),
    speakerVolume: cfg.get<number>('speakerVolume'),
    micVolume: cfg.get<number>('micVolume'),
    pushToTalk: cfg.get<boolean>('pushToTalk'),
    pushToTalkKey: cfg.get<number>('pushToTalkKey'),
    pushToTalkMouseButton: cfg.get<number>('pushToTalkMouseButton'),
    pushToTalkModifiers: cfg.get<string>('pushToTalkModifiers'),
  };
};

const getOverlayConfig = (cfg: ConfigService): ObsOverlayConfig => {
  return {
    chatOverlayEnabled: cfg.get<boolean>('chatOverlayEnabled'),
    chatOverlayWidth: cfg.get<number>('chatOverlayWidth'),
    chatOverlayHeight: cfg.get<number>('chatOverlayHeight'),
    chatOverlayXPosition: cfg.get<number>('chatOverlayXPosition'),
    chatOverlayYPosition: cfg.get<number>('chatOverlayYPosition'),
  };
};

export { getStorageConfig, getObsBaseConfig, getObsVideoConfig, getObsAudioConfig, getOverlayConfig };
