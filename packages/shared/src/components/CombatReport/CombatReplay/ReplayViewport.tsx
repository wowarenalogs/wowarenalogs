import { extend, useApplication } from '@pixi/react';
import { useEffect, useRef } from 'react';
import { Viewport } from 'pixi-viewport';

extend({ Viewport });

interface IReplayViewportProps {
  children?: React.ReactNode;
  width: number;
  height: number;
  worldWidth: number;
  worldHeight: number;
}

export const ReplayViewport = (props: IReplayViewportProps) => {
  const { app } = useApplication();
  const viewportRef = useRef<Viewport | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.drag().wheel();
    viewport.setZoom(8);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.screenWidth = props.width;
    viewport.screenHeight = props.height;
    viewport.worldWidth = props.worldWidth;
    viewport.worldHeight = props.worldHeight;
  }, [props.width, props.height, props.worldWidth, props.worldHeight]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !app) {
      return;
    }

    const events = app.renderer?.events;
    if (events) {
      viewport.events = events;
    }

    const interaction = app.renderer?.plugins?.interaction;
    if (interaction) {
      viewport.interaction = interaction;
    }
  }, [app]);

  return (
    <viewport
      ref={viewportRef}
      screenWidth={props.width}
      screenHeight={props.height}
      worldWidth={props.worldWidth}
      worldHeight={props.worldHeight}
    >
      {props.children}
    </viewport>
  );
};
