import { extend, useApplication } from '@pixi/react';
import type { EventSystem, Ticker } from 'pixi.js';
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
  events: EventSystem;
  ticker?: Ticker;
  children?: ReactNode;
};
const ViewportElement = 'viewport' as unknown as ComponentType<ViewportElementProps>;

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
  const events = app?.renderer?.events as EventSystem | undefined;

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

    viewport.resize(props.width, props.height, props.worldWidth, props.worldHeight);
  }, [props.width, props.height, props.worldWidth, props.worldHeight]);

  if (!events) {
    return null;
  }

  return (
    <ViewportElement
      ref={viewportRef}
      screenWidth={props.width}
      screenHeight={props.height}
      worldWidth={props.worldWidth}
      worldHeight={props.worldHeight}
      events={events}
      ticker={app?.ticker}
    >
      {props.children}
    </ViewportElement>
  );
};
