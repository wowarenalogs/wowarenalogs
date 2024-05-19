import { Size } from 'electron';

import ConfigService from './configService';

/**
 * Application recording status.
 */
export type RecStatus =
  | 'EngineNotStarted'
  | 'WaitingForWoW'
  | 'Recording'
  | 'InvalidConfig'
  | 'ReadyToRecord'
  | 'FatalError'
  | 'Overrunning';

export enum MicStatus {
  NONE,
  MUTED,
  LISTENING,
}

export type ILogger = {
  info: (arg0: string) => void;
  error: (arg0: string) => void;
  warn: (arg0: string) => void;
};

export enum FileSortDirection {
  NewestFirst,
  OldestFirst,
}

export type ResolutionOptions =
  | '1024x768'
  | '1280x720'
  | '1280x800'
  | '1280x1024'
  | '1360x768'
  | '1366x768'
  | '1440x900'
  | '1600x900'
  | '1680x1050'
  | '1920x1080'
  | '1920x1200'
  | '2560x1080'
  | '2560x1440'
  | '2560x1600'
  | '3440x1440'
  | '3840x1080'
  | '3440x1200'
  | '3840x1440'
  | '3840x1600'
  | '3840x2160'
  | '5120x1440';

/**
 * Specifies the format that we use in Settings to display monitors
 * to the user.
 */
export type OurDisplayType = {
  id: number;
  index: number;
  physicalPosition: string;
  primary: boolean;
  displayFrequency: number;
  depthPerComponent: number;
  size: Size;
  physicalSize: Size;
  aspectRatio: number;
  scaleFactor: number;
};

export type FileInfo = {
  name: string;
  size: number;
  mtime: number;
};

export type VideoQueueItem = {
  bufferFile: string;
  metadata?: Metadata;
  filename: string;
  relativeStart: number;
  duration: number;
  compensationTimeSeconds: number;
};

/**
 * This is what we write to the .json files. We use "raw" subtypes here to
 * represent any classes as writing entire classes to JSON files causes
 * problems on the frontend.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Metadata = Record<string, any>;

/**
 * Frontend metadata type, this is Metadata above plus a bunch of fields we
 * add when reading the file.
 */
export type RendererVideo = Metadata & {
  mtime: number;
  fullPath: string;
  imagePath: string;
  isProtected: boolean;
  size: number;
};

export interface IOBSDevice {
  id: string;
  description: string;
}

export enum TAudioSourceType {
  input = 'wasapi_input_capture',
  output = 'wasapi_output_capture',
}

export type TPreviewPosition = {
  width: number;
  height: number;
  xPos: number;
  yPos: number;
};

export type ConfigStage = {
  name: string;
  initial: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  current: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (cfg: ConfigService) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configure: (...args: any[]) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate: (...args: any[]) => void;
};

export type StorageConfig = {
  storagePath: string;
};

export type ObsBaseConfig = {
  bufferStoragePath: string;
  obsOutputResolution: string;
  obsFPS: number;
  obsKBitRate: number;
  obsRecEncoder: string;
};

export type ObsVideoConfig = {
  obsCaptureMode: string;
  monitorIndex: number;
  captureCursor: boolean;
};

export type ObsOverlayConfig = {
  chatOverlayEnabled: boolean;
  chatOverlayWidth: number;
  chatOverlayHeight: number;
  chatOverlayXPosition: number;
  chatOverlayYPosition: number;
};

export type ObsAudioConfig = {
  audioInputDevices: string;
  audioOutputDevices: string;
  obsForceMono: boolean;
  speakerVolume: number;
  micVolume: number;
  pushToTalk: boolean;
  pushToTalkKey: number;
  pushToTalkMouseButton: number;
  pushToTalkModifiers: string;
};
