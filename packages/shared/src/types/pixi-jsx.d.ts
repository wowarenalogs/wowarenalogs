import type { PixiReactElementProps } from '@pixi/react';
import type { Viewport } from 'pixi-viewport';

declare module '@pixi/react' {
  interface PixiElements {
    viewport: PixiReactElementProps<typeof Viewport>;
  }
}
