/* eslint-disable @typescript-eslint/no-explicit-any */
import { ipcRenderer, contextBridge } from 'electron';

// import { join } from 'path';
import * as eventNames from '../ipcEventNames';
import { WALWindowAPI } from '../renderer';

const api: WALWindowAPI = {
  // sendSync is legacy style call, needs to be converted to invoke() as well
  getPlatform: () => ipcRenderer.sendSync(eventNames.IPC_GET_PLATFORM_SYNC),
  joinDirPath: (args: string[]) => ipcRenderer.invoke(eventNames.IPC_CALL_PATH_JOIN, args),

  fsCloseSync: (fd: number) => ipcRenderer.invoke(eventNames.IPC_FS_CLOSE_SYNC, fd),
  fsEnsureDir: (path: string) => ipcRenderer.invoke(eventNames.IPC_FS_ENSURE_DIR, path),
  // joinTest: (path: string) => join('C:\\Windows', 'explorer.exe'),
  fsOpenSync: (path: string) => ipcRenderer.invoke(eventNames.IPC_FS_OPEN_SYNC, path),
  fsReadSync: (args: {
    fd: number;
    buffer: NodeJS.ArrayBufferView;
    offset: number;
    length: number;
    position: number | null;
  }) => ipcRenderer.invoke(eventNames.IPC_FS_READ_SYNC, args),
  fsWriteFileSync: (args: { path: number | string; data: any; options?: string | undefined }) =>
    ipcRenderer.invoke(eventNames.IPC_FS_WRITE_FILE_SYNC, args),

  setWindowTitle: (title: string) => ipcRenderer.invoke(eventNames.IPC_SET_WINDOW_TITLE, title),

  setWindowSize: function (args: { width: number; height: number }): Promise<void> {
    throw new Error('Function not implemented.');
  },
  setWindowMinimumSize: function (args: { width: number; height: number }): Promise<void> {
    throw new Error('Function not implemented.');
  },
  onWindowMoved: function (callback: (event: any, value: any) => void): Promise<void> {
    throw new Error('Function not implemented.');
  },
  onWindowResized: function (callback: (event: any, value: any) => void): Promise<void> {
    throw new Error('Function not implemented.');
  },
};

console.log('Preloaded module');
contextBridge.exposeInMainWorld('wowarenalogs', api);
