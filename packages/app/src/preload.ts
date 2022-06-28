import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { appApi } from './nativeBridge/modules/applicationModule.api';
import { bnetApi } from './nativeBridge/modules/bnetModule.api';
import { linksApi } from './nativeBridge/modules/externalLinksModule.api';
import { fsApi } from './nativeBridge/modules/filesModule.api';
import { logsApi } from './nativeBridge/modules/logWatcherModule.api';
import { winApi } from './nativeBridge/modules/mainWindowModule.api';
import { ModuleApi } from './nativeBridge/types';

type BridgeApi = Record<string, any>;

const bridgeApi: BridgeApi = {};

function qualifiedName(fnName: string, moduleName: string) {
  return `wowarenalogs:${moduleName}:${fnName}`;
}

function ipcInvoke(fnName: string, moduleName: string) {
  return (...args: any[]) => ipcRenderer.invoke(qualifiedName(fnName, moduleName), ...args);
}

function ipcOn(fnName: string, moduleName: string) {
  return (callback: (event: IpcRendererEvent, ...args: any[]) => void) =>
    ipcRenderer.on(qualifiedName(fnName, moduleName), callback);
}

function ipcOnce(fnName: string, moduleName: string) {
  return (callback: (event: IpcRendererEvent, ...args: any[]) => void) =>
    ipcRenderer.once(qualifiedName(fnName, moduleName), callback);
}

function registerApi(api: ModuleApi) {
  const moduleApi: BridgeApi = {};
  bridgeApi[api.moduleName] = moduleApi;
  api.invoke?.forEach((f) => {
    moduleApi[f] = ipcInvoke(f, api.moduleName);
  });
  api.on?.forEach((f) => {
    moduleApi[f] = ipcOn(f, api.moduleName);
  });
  api.once?.forEach((f) => {
    moduleApi[f] = ipcOnce(f, api.moduleName);
  });
}

registerApi(logsApi);
registerApi(fsApi);
registerApi(appApi);
registerApi(bnetApi);
registerApi(linksApi);
registerApi(winApi);

contextBridge.exposeInMainWorld('wowarenalogs', {
  ...bridgeApi,
});
