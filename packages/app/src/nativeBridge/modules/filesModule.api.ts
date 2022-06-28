import { ModuleApi } from '../types';

export const fsApi: ModuleApi = {
  moduleName: 'fs',
  invoke: ['selectFolder', 'installAddon', 'getInstallationsFolder'],
  once: ['folderSelected'],
};
