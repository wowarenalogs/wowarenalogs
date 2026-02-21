import { extend, useApplication } from '@pixi/react';
import { Viewport } from 'pixi-viewport';
import type { ComponentType, ReactNode, Ref } from 'react';
import { useEffect, useRef } from 'react';

extend({ Viewport });
type ViewportElementProps = {
  ref: Ref<Viewport>;
  screenWidth: number;
  screenHeight: number;
  worldWidth: number;
  worldHeight: number;
  children?: ReactNode;
};
const ViewportElement = 'viewport' as unknown as ComponentType<ViewportElementProps>;
type RendererWithEvents = {
  events?: unknown;
  plugins?: {
    interaction?: unknown;
  };
};
type ViewportWithLegacyInteraction = Viewport & {
  events?: unknown;
  interaction?: unknown;
};

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

    const renderer = app.renderer as RendererWithEvents;
    const viewportWithInteraction = viewport as ViewportWithLegacyInteraction;
    const events = renderer?.events;
    if (events) {
      viewportWithInteraction.events = events;
    }

    const interaction = renderer?.plugins?.interaction;
    if (interaction) {
      viewportWithInteraction.interaction = interaction;
    }
  }, [app]);

  return (
    <ViewportElement
      ref={viewportRef}
      screenWidth={props.width}
      screenHeight={props.height}
      worldWidth={props.worldWidth}
      worldHeight={props.worldHeight}
    >
      {props.children}
    </ViewportElement>
  );
};
