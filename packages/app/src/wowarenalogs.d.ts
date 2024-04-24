import type { INativeBridge } from './types/nativeBridge';

declare global {
  interface Window {
    wowarenalogs: INativeBridge;
  }
}
