/* eslint-disable @typescript-eslint/no-explicit-any */
import { ipcRenderer, contextBridge } from 'electron';

// import { join } from 'path';

// import * as eventNames from '../ipcEventNames';
// import { WALWindowAPI } from '../renderer';

const api: Record<string, any> = {
  // joinTest: (paths: string[]) => join(...paths),

  // sendSync is legacy style call, needs to be converted to invoke() as well
  getPlatform: () => ipcRenderer.sendSync('get-platform-sync'),
  // joinDirPath: (args: string[]) => ipcRenderer.invoke('call-path-join', args),
};

console.log('Preloaded module');
contextBridge.exposeInMainWorld('wowarenalogs', api);
