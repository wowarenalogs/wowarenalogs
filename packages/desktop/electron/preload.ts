import { ipcRenderer, contextBridge } from 'electron';

console.log('Preloaded module');
console.log(1, eval('global'));
console.log(2, eval('globalThis'));
contextBridge.exposeInMainWorld('wowarenalogs', {
  getPlatform: () => ipcRenderer.send('do-a-thing'),
});
