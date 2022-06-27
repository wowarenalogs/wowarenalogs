/* eslint-disable @typescript-eslint/no-explicit-any */
import { BnetLoginBridgeAPI } from './src/main-utils/bnetLoginBridge';
import { ExternalUrlsBridgeAPI } from './src/main-utils/externalUrlsBridge';
import { FolderSelectBridgeWindowAPI } from './src/main-utils/folderSelectBridge';
import { LoggerBridgeWindowAPI } from './src/main-utils/loggerBridge';
import { WowFolderBridgeAPI } from './src/main-utils/wowFolderBridge';

declare global {
  interface Window {
    wowarenalogs: {
      folders: FolderSelectBridgeWindowAPI;
      wowFolder: WowFolderBridgeAPI;
      bnet: BnetLoginBridgeAPI;
      logger: LoggerBridgeWindowAPI;
      urls: ExternalUrlsBridgeAPI;
      environment: {
        getPlatform: () => string;
      };
    };
  }
}
