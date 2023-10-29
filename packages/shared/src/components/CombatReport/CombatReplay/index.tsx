import { Sprite, Stage } from '@inlet/react-pixi';
import { CombatUnitType } from '@wowarenalogs/parser';
import _ from 'lodash';
import moment from 'moment';
import PIXI from 'pixi.js';
import { ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaSkullCrossbones } from 'react-icons/fa';
import { TbPlayerPause, TbPlayerPlay } from 'react-icons/tb';

import { zoneMetadata } from '../../../data/zoneMetadata';
import { CombatReportContext, useCombatReportContext } from '../CombatReportContext';
import { ReplayCharacter } from './ReplayCharacter';
import { ReplayDampeningTracker } from './ReplayDampeningTracker';
import { ReplayEvents } from './ReplayEvents';
import { ReplaySpeedDropdown } from './ReplaySpeedDropdown';
import { ReplayUnitFrames } from './ReplayUnitFrames';
import { ReplayViewport } from './ReplayViewport';

const VIEWPORT_PADDING = 10;
const VIEWPORT_X_OFFSET = 20;

// Account for extra time at start of vod?
// TODO: MUSTFIX Handle time sync better
const TIME_CORRECT = 2.75;

const debouncedSlide = _.debounce(
  (
    v: number,
    setPaused: React.Dispatch<React.SetStateAction<boolean>>,
    setCurrentTimeOffset: React.Dispatch<React.SetStateAction<number>>,
    setVideoTime: (n: number) => void,
  ) => {
    setPaused(true);
    setCurrentTimeOffset(typeof v === 'number' ? v : 0);
    setVideoTime(TIME_CORRECT + v / 1000); // TODO: MUSTFIX Handle time sync better
  },
  1,
);

// See https://reactpixi.org/context-bridge
// pixi needs the context injected because it uses a custom renderer
const ContextBridge = ({
  children,
  Context,
  render,
}: {
  children: ReactElement;
  Context: typeof CombatReportContext;
  render: (children: ReactElement) => ReactElement;
}) => {
  return (
    <Context.Consumer>
      {(value) => render(<Context.Provider value={value}>{children}</Context.Provider>)}
    </Context.Consumer>
  );
};

export function CombatReplay() {
  const { combat } = useCombatReportContext();

  const [replayContainerRef, setReplayContainerRef] = useState<HTMLDivElement | null>(null);
  const initializeReplayContainerRef = useCallback((el: HTMLDivElement) => {
    setReplayContainerRef(el);
  }, []);

  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTimeOffset, setCurrentTimeOffset] = useState(0);
  const [filterEventsByPlayerId, setFilterEventsByPlayerId] = useState<string | null>(null);
  const [sliderPos, setSliderPos] = useState(0);
  const [pixiApp, setPixiApp] = useState<PIXI.Application | null>(null);

  // TODO: MUSTFIX Is this where video will go? tbd
  const vidRef = useRef<HTMLVideoElement>(null);

  // reset state every time we switch to a different combat
  useEffect(() => {
    setPaused(false);
    setCurrentTimeOffset(0);
  }, [combat]);

  useEffect(() => {
    if (pixiApp && combat) {
      const onTick = () => {
        if (!paused) {
          setSliderPos((prev) => {
            const result = prev + (pixiApp.ticker.deltaMS || 0) * speed;
            if (result < combat.endTime - combat.startTime) {
              return result;
            } else {
              return combat.endTime - combat.startTime;
            }
          });
          setCurrentTimeOffset((prev) => {
            const result = prev + (pixiApp.ticker.deltaMS || 0) * speed;
            if (result < combat.endTime - combat.startTime) {
              return result;
            } else {
              return combat.endTime - combat.startTime;
            }
          });
        }
      };
      pixiApp.ticker.add(onTick);
      return () => {
        if (pixiApp.ticker) {
          pixiApp.ticker.remove(onTick);
        }
      };
    }
    return;
  }, [pixiApp, combat, paused, speed]);

  useEffect(() => {
    if (combat && currentTimeOffset >= combat.endTime - combat.startTime) {
      setPaused(true);
    }
  }, [combat, currentTimeOffset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setPaused((prev) => {
          // TODO: MUSTFIX Is this where video will go? tbd
          if (prev) {
            vidRef.current?.play();
          } else {
            vidRef.current?.pause();
          }

          return !prev;
        });
      }
    };
    window.addEventListener('keyup', onKey);

    return () => {
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  const zone = zoneMetadata[combat?.startInfo?.zoneId || ''];

  const [worldWidth, worldHeight, worldMinX, worldMinY] = useMemo(() => {
    if (!combat) {
      return [1, 1, 0, 0];
    }

    let minX = Number.MAX_SAFE_INTEGER;
    let maxX = Number.MIN_SAFE_INTEGER;
    let minY = Number.MAX_SAFE_INTEGER;
    let maxY = Number.MIN_SAFE_INTEGER;
    _.forEach(combat.units, (u) => {
      u.advancedActions.forEach((a) => {
        minX = Math.min(minX, -a.advancedActorPositionX);
        minY = Math.min(minY, a.advancedActorPositionY);
        maxX = Math.max(maxX, -a.advancedActorPositionX);
        maxY = Math.max(maxY, a.advancedActorPositionY);
      });
    });
    return [maxX - minX, maxY - minY, minX, minY, maxX, maxY];
  }, [combat]);

  const players = useMemo(() => {
    return _.values(combat ? combat.units : []).filter((u) => u.type === CombatUnitType.Player);
  }, [combat]);

  const deaths = _.flatten(players.map((p) => p.deathRecords)).sort((a, b) => a.timestamp - b.timestamp);

  if (!combat) {
    return null;
  }

  if (!combat.hasAdvancedLogging) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="hero">
          <div className="hero-content text-center flex flex-col">
            <h1 className="text-5xl font-bold">Turn on Advanced Combat Logging</h1>
            <p className="py-6">
              Replay is only available for matches logged with advanced combat logging. Please enable it in the Network
              tab in your World of Warcraft settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col flex-1 h-full w-full`}
      style={{
        minHeight: '720px',
      }}
    >
      <div className="flex flex-row mx-2 items-center mb-2">
        <div className="mr-1">
          <div className="tooltip" data-tip={paused ? 'Press Spacebar To Resume' : 'Press Spacebar To Pause'}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setPaused((prev) => {
                  return !prev;
                });
              }}
            >
              {paused ? <TbPlayerPlay /> : <TbPlayerPause />}
            </button>
          </div>
        </div>
        <div className="mr-2">
          <ReplaySpeedDropdown speed={speed} setSpeed={setSpeed} />
        </div>
        <div className="mr-2">
          <div className="tooltip" data-tip="Jump to First Blood">
            <button
              className={`btn btn-sm btn-ghost ${deaths.length === 0 ? 'btn-disabled' : ''}`}
              onClick={() => {
                setPaused(true);
                // + 1 added to timestamp here so the death event is guaranteed to show
                // on the replay events list
                setCurrentTimeOffset(deaths[0].timestamp - combat.startTime + 1);
                setSliderPos(deaths[0].timestamp - combat.startTime + 1);
              }}
            >
              <FaSkullCrossbones />
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <input
            type="range"
            className="range range-sm"
            min={0}
            max={combat.endTime - combat.startTime}
            value={sliderPos}
            step={100}
            onChange={(e) => {
              setSliderPos(e.target.valueAsNumber);
              debouncedSlide(e.target.valueAsNumber, setPaused, setCurrentTimeOffset, (n: number) => {
                // TODO: MUSTFIX Is this where video will go? tbd
                if (vidRef.current) {
                  vidRef.current.currentTime = n;
                }
              });
            }}
          />
        </div>
        <button
          onClick={() => {
            // TODO: MUSTFIX Is this where video will go? tbd
            if (vidRef.current?.currentTime) vidRef.current.currentTime = 3;
          }}
        >
          reset vod
        </button>
        <div className="ml-2">{moment.utc(currentTimeOffset).format('mm:ss')}</div>
        <div className="opacity-60 mr-2">
          &nbsp;
          {'/ ' + moment.utc(combat.endTime - combat.startTime).format('mm:ss')}
        </div>
        <ReplayDampeningTracker
          players={players}
          bracket={combat.startInfo.bracket}
          currentTimestamp={currentTimeOffset + combat.startInfo.timestamp}
        />
      </div>
      <video
        // TODO: MUSTFIX Is this where video will go? tbd
        controls
        id="video"
        ref={vidRef}
        // domain here looks weird but chrome will canonicalize the item in the string it thinks is the domain
        // which will lead to the b64 string losing its casing :(
        src={`vod://wowarenalogs/${btoa(
          'D:\\Video\\2023-10-28 22-46-57 - Rated Solo Shuffle_1badc357e2250214a34f48a72b4d6b01.mp4',
        )}`}
        style={{
          zIndex: 10,
          position: 'absolute',
          top: 200,
          left: 500,
          float: 'left',
          margin: 'auto',
          flex: 1,
          objectFit: 'contain',
          minWidth: 0,
          minHeight: 0,
          width: 1920 / 2,
          height: 1080 / 2,
        }}
      />
      <div className={`flex flex-col flex-1 rounded-box bg-base-200 overflow-hidden relative`}>
        <div className="w-full h-full absolute" ref={initializeReplayContainerRef}>
          {replayContainerRef ? (
            <ContextBridge
              Context={CombatReportContext}
              render={(children) => (
                <Stage
                  width={replayContainerRef.clientWidth}
                  height={replayContainerRef.clientHeight}
                  options={{
                    antialias: true,
                    autoDensity: true,
                    backgroundAlpha: 0,
                  }}
                  onMount={setPixiApp}
                  onUnmount={() => {
                    setPixiApp(null);
                  }}
                >
                  {children}
                </Stage>
              )}
            >
              <ReplayViewport
                key={combat.id}
                width={replayContainerRef.clientWidth}
                height={replayContainerRef.clientHeight}
                worldWidth={worldWidth + 2 * VIEWPORT_PADDING + VIEWPORT_X_OFFSET}
                worldHeight={worldHeight + 2 * VIEWPORT_PADDING}
                pixiApp={pixiApp}
              >
                {zone ? (
                  <Sprite
                    image={`https://images.wowarenalogs.com/minimaps/${zone.id}.png`}
                    width={zone.imageWidth / 5}
                    height={zone.imageHeight / 5}
                    x={-zone.maxX - worldMinX + VIEWPORT_PADDING + VIEWPORT_X_OFFSET}
                    y={zone.minY - worldMinY + VIEWPORT_PADDING}
                  />
                ) : null}
                {players.map((p) => {
                  return (
                    <ReplayCharacter
                      combat={combat}
                      key={p.id}
                      unit={p}
                      currentTimeOffset={currentTimeOffset}
                      gamePositionToRenderPosition={(gameX, gameY) => ({
                        x: -gameX - worldMinX + VIEWPORT_PADDING + VIEWPORT_X_OFFSET,
                        y: gameY - worldMinY + VIEWPORT_PADDING,
                      })}
                    />
                  );
                })}
              </ReplayViewport>
            </ContextBridge>
          ) : null}
        </div>
        <div className="flex flex-row flex-1 items-start justify-between">
          <ReplayUnitFrames
            combat={combat}
            players={players}
            currentTimeOffset={currentTimeOffset}
            onClickUnit={(id) => setFilterEventsByPlayerId(id)}
          />
          <ReplayEvents
            currentTimeOffset={currentTimeOffset}
            filterByUnitId={filterEventsByPlayerId}
            setUnitIdFilter={setFilterEventsByPlayerId}
          />
        </div>
      </div>
    </div>
  );
}
