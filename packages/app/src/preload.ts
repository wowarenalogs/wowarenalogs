import { contextBridge } from 'electron';
import { modulesApi } from './preloadApi';

contextBridge.exposeInMainWorld('wowarenalogs', {
  ...modulesApi,
  platform: process.platform,
});
