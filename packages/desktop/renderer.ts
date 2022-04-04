/* eslint-disable @typescript-eslint/no-explicit-any */
import { LoggerBridgeWindowAPI } from './src/main-utils/loggerBridge';

declare global {
  interface Window {
    walLoggerBridge: LoggerBridgeWindowAPI;
  }
}
