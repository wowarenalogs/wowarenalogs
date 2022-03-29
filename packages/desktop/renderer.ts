/* eslint-disable @typescript-eslint/no-explicit-any */

export interface WALWindowAPI {
  getPlatform: () => string;
  // joinTest: (paths: string[]) => string;
}

declare global {
  interface Window {
    wowarenalogs: WALWindowAPI;
  }
}
