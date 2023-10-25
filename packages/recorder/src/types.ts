import { Size } from 'electron';

/**
 * Application recording status.
 */
export enum RecStatus {
  WaitingForWoW,
  Recording,
  InvalidConfig,
  ReadyToRecord,
  FatalError,
  Overruning,
}

export enum MicStatus {
  NONE,
  MUTED,
  LISTENING,
}

/**
 * Application saving status.
 */
export enum SaveStatus {
  Saving,
  NotSaving,
}

export enum FileSortDirection {
  NewestFirst,
  OldestFirst,
}

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
  metadata: Metadata;
  filename: string;
  relativeStart: number;
};

/**
 * This is what we write to the .json files. We use "raw" subtypes here to
 * represent any classes as writing entire classes to JSON files causes
 * problems on the frontend.
 */
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
