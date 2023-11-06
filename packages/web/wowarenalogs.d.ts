import { INativeBridge } from '@wowarenalogs/shared';

declare global {
  interface Window {
    wowarenalogs: INativeBridge;
  }
}
