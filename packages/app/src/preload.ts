import { contextBridge } from 'electron';
import { nativeBridgeRegistry } from './nativeBridge/registry';

contextBridge.exposeInMainWorld('wowarenalogs', nativeBridgeRegistry.generateAPIObject());
