/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExternalUrlsBridgeAPI } from './src/main-utils/externalUrlsBridge';
import { FolderSelectBridgeWindowAPI } from './src/main-utils/folderSelectBridge';
import { LoggerBridgeWindowAPI } from './src/main-utils/loggerBridge';

declare global {
  interface Window {
    wowarenalogs: {
      folders: FolderSelectBridgeWindowAPI;
      logger: LoggerBridgeWindowAPI;
      urls: ExternalUrlsBridgeAPI;
      environment: {
        getPlatform: () => string;
      };
    };
  }
}
