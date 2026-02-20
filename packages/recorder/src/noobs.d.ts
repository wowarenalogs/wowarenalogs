/**
 * Type shim for optional dependency "noobs" (Windows-only).
 * Used when node_modules/noobs is not present (e.g. Linux CI) so the project still compiles.
 */
declare module 'noobs' {
  export type ObsDataValue = string | number | boolean | ObsData | ObsData[] | null;

  export interface ObsData {
    [key: string]: ObsDataValue;
  }

  export type ObsPropertyType = string;

  export interface ObsListItem {
    name: string;
    value: string | number;
    disabled: boolean;
  }

  export interface ObsPropertyBase {
    name: string;
    description: string;
    type: ObsPropertyType;
    enabled: boolean;
    visible: boolean;
    items?: ObsListItem[];
  }

  export interface ObsListProperty extends ObsPropertyBase {
    type: 'list';
    items: ObsListItem[];
  }

  export type ObsProperty = ObsPropertyBase | ObsListProperty;

  export type Signal = {
    type: string;
    id: string;
    code: number;
    value?: number;
  };

  export type FileExtension = 'mp4' | 'mkv';

  interface Noobs {
    Init(distPath: string, logPath: string, cb: (signal: Signal) => void): void;
    Shutdown(): void;
    SetBuffering(buffering: boolean): void;
    StartBuffer(): void;
    StartRecording(offset: number): void;
    StopRecording(): void;
    ForceStopRecording(): void;
    GetLastRecording(): string;
    SetRecordingCfg(recordingPath: string, fileExtension: FileExtension): void;
    ResetVideoContext(fps: number, width: number, height: number): void;
    ListVideoEncoders(): string[];
    SetVideoEncoder(id: string, settings: ObsData): void;
    CreateSource(name: string, type: string): string;
    DeleteSource(name: string): void;
    GetSourceSettings(name: string): ObsData;
    SetSourceSettings(name: string, settings: ObsData): void;
    GetSourceProperties(name: string): ObsProperty[];
    SetSourceVolume(name: string, volume: number): void;
    SetForceMono(enabled: boolean): void;
    AddSourceToScene(sourceName: string): void;
    RemoveSourceFromScene(sourceName: string): void;
    GetSourcePos(name: string): {
      x: number;
      y: number;
      scaleX: number;
      scaleY: number;
      width: number;
      height: number;
      cropLeft: number;
      cropRight: number;
      cropTop: number;
      cropBottom: number;
    };
    SetSourcePos(name: string, pos: Record<string, number>): void;
    InitPreview(hwnd: Buffer): void;
    ConfigurePreview(x: number, y: number, width: number, height: number): void;
    ShowPreview(): void;
    HidePreview(): void;
  }

  const noobs: Noobs;
  export default noobs;
}
