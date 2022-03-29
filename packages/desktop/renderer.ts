/* eslint-disable @typescript-eslint/no-explicit-any */

export interface WALWindowAPI {
  getPlatform: () => any;
  joinDirPath: (args: string[]) => Promise<any>;
  fsCloseSync: (fd: number) => Promise<any>;
  fsEnsureDir: (path: string) => Promise<any>;
  // joinTest: (path: string) => string;
  fsOpenSync: (path: string) => Promise<any>;
  fsReadSync: (args: {
    fd: number;
    buffer: NodeJS.ArrayBufferView; // Can this serialize over the bridge?
    offset: number;
    length: number;
    position: number | null;
  }) => Promise<any>;
  fsWriteFileSync: (args: { path: number | string; data: any; options?: string | undefined }) => Promise<any>;
  setWindowTitle: (title: string) => Promise<void>;
  setWindowSize: (args: { width: number; height: number }) => Promise<void>;
  setWindowMinimumSize: (args: { width: number; height: number }) => Promise<void>;
  onWindowMoved: (callback: (event: any, value: any) => void) => Promise<void>;
  onWindowResized: (callback: (event: any, value: any) => void) => Promise<void>;
}

declare global {
  interface Window {
    wowarenalogs: WALWindowAPI;
  }
}
