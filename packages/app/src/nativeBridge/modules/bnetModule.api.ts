import { ModuleApi } from '../types';

export const bnetApi: ModuleApi = {
  moduleName: 'bnet',
  invoke: ['login'],
  once: ['onLoggedIn'],
};
