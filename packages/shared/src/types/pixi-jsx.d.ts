import type { PixiReactElementProps } from '@pixi/react';
import type { Container, Sprite, Text } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';

declare module '@pixi/react' {
  interface PixiElements {
    pixiContainer: PixiReactElementProps<typeof Container>;
    pixiSprite: PixiReactElementProps<typeof Sprite>;
    pixiText: PixiReactElementProps<typeof Text>;
    viewport: PixiReactElementProps<typeof Viewport>;
  }
}
