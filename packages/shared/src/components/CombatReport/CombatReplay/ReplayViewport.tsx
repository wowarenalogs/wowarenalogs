import { extend } from '@pixi/react';
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
  events: EventSystem;
  ticker?: Ticker;
}

export const ReplayViewport = (props: IReplayViewportProps) => {
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

    viewport.resize(props.width, props.height, props.worldWidth, props.worldHeight);
  }, [props.width, props.height, props.worldWidth, props.worldHeight]);

  return (
    <ViewportElement
      ref={viewportRef}
      screenWidth={props.width}
      screenHeight={props.height}
      worldWidth={props.worldWidth}
      worldHeight={props.worldHeight}
      events={props.events}
      ticker={props.ticker}
    >
      {props.children}
    </ViewportElement>
  );
};
