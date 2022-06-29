import { ModuleApi } from '../types';

export const logsApi: ModuleApi = {
  moduleName: 'logs',
  invoke: ['startLogWatcher', 'stopLogWatcher'],
  on: ['handleNewCombat'],
  removeAll: ['handleNewCombat'],
};
