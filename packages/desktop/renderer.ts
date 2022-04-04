/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExternalUrlsBridgeAPI } from './src/main-utils/externalUrlsBridge';
import { LoggerBridgeWindowAPI } from './src/main-utils/loggerBridge';

declare global {
  interface Window {
    walLoggerBridge: LoggerBridgeWindowAPI;
    externalUrlsBridge: ExternalUrlsBridgeAPI;
  }
}
