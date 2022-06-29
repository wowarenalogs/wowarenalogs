import { ModuleApi } from '../types';

export const winApi: ModuleApi = {
  moduleName: 'win',
  invoke: [
    'setWindowPosition',
    'setWindowSize',
    'isMaximized',
    'isMinimized',
    'minimize',
    'maximize',
    'getWindowPosition',
    'getWindowSize',
  ],
  on: ['onWindowResized', 'onWindowMoved'],
};
