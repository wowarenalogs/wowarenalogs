import { PixiComponent } from '@inlet/react-pixi';
import PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';

interface IReplayViewportProps {
  width: number;
  height: number;
  worldWidth: number;
  worldHeight: number;
  pixiApp: PIXI.Application | null;
}

export const ReplayViewport = PixiComponent<IReplayViewportProps, Viewport>('ReplayViewport', {
  create: (props) => {
    const result = new Viewport({
      worldWidth: props.worldWidth,
      worldHeight: props.worldHeight,
      interaction: props.pixiApp?.renderer.plugins.interaction,
    });
    result.drag().wheel();
    return result;
  },
  applyProps: (instance, _, props) => {
    instance.screenWidth = props.width;
    instance.screenHeight = props.height;
    instance.worldWidth = props.worldWidth;
    instance.worldHeight = props.worldHeight;
  },
  didMount: (instance) => {
    instance.setZoom(8);
  },
});
