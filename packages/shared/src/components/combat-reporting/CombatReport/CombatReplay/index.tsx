import { CaretRightFilled, PauseOutlined } from '@ant-design/icons';
import { Sprite, Stage } from '@inlet/react-pixi';
import { Button, Tooltip, Slider } from 'antd';
import Text from 'antd/lib/typography/Text';
import _ from 'lodash';
import moment from 'moment';
import { useTranslation } from 'next-i18next';
import PIXI from 'pixi.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CombatUnitType, ICombatData } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { useClientContext } from '../../../../hooks/ClientContext';
import { zoneMetadata } from '../../../../utils/zoneMetadata';
import { Box } from '../../../common/Box';
import { ReplayCharacter } from './ReplayCharacter';
import { ReplayDampeningTracker } from './ReplayDampeningTracker';
import { ReplayEvents } from './ReplayEvents';
import { ReplaySpeedDropdown } from './ReplaySpeedDropdown';
import { ReplayUnitFrames } from './ReplayUnitFrames';
import { ReplayViewport } from './ReplayViewport';

const VIEWPORT_PADDING = 10;
const VIEWPORT_X_OFFSET = 20;

interface IProps {
  combat: ICombatData;
}

const debouncedSlide = _.debounce(
  (
    v: number,
    setPaused: React.Dispatch<React.SetStateAction<boolean>>,
    setCurrentTimeOffset: React.Dispatch<React.SetStateAction<number>>,
  ) => {
    setPaused(true);
    setCurrentTimeOffset(typeof v === 'number' ? v : 0);
  },
  1,
);

export function CombatReplay(props: IProps) {
  const { t } = useTranslation();
  const clientContext = useClientContext();

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

  const updateSlider = (v: number) => {
    setSliderPos(v);
    debouncedSlide(v, setPaused, setCurrentTimeOffset);
  };

  // reset state every time we switch to a different combat
  useEffect(() => {
    setPaused(false);
    setCurrentTimeOffset(0);
  }, [props.combat]);

  useEffect(() => {
    if (pixiApp) {
      const onTick = () => {
        if (!paused) {
          setSliderPos((prev) => {
            const result = prev + (pixiApp.ticker.deltaMS || 0) * speed;
            if (result < props.combat.endTime - props.combat.startTime) {
              return result;
            } else {
              return props.combat.endTime - props.combat.startTime;
            }
          });
          setCurrentTimeOffset((prev) => {
            const result = prev + (pixiApp.ticker.deltaMS || 0) * speed;
            if (result < props.combat.endTime - props.combat.startTime) {
              return result;
            } else {
              return props.combat.endTime - props.combat.startTime;
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
  }, [pixiApp, props.combat, paused, speed]);

  useEffect(() => {
    if (currentTimeOffset >= props.combat.endTime - props.combat.startTime) {
      setPaused(true);
    }
  }, [props.combat, currentTimeOffset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setPaused((prev) => {
          return !prev;
        });
      }
    };
    window.addEventListener('keyup', onKey);

    return () => {
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  const zone = zoneMetadata[props.combat.startInfo?.zoneId || ''];

  const [worldWidth, worldHeight, worldMinX, worldMinY] = useMemo(() => {
    let minX = Number.MAX_SAFE_INTEGER;
    let maxX = Number.MIN_SAFE_INTEGER;
    let minY = Number.MAX_SAFE_INTEGER;
    let maxY = Number.MIN_SAFE_INTEGER;
    _.forEach(props.combat.units, (u) => {
      u.advancedActions.forEach((a) => {
        minX = Math.min(minX, -a.advancedActorPositionX);
        minY = Math.min(minY, a.advancedActorPositionY);
        maxX = Math.max(maxX, -a.advancedActorPositionX);
        maxY = Math.max(maxY, a.advancedActorPositionY);
      });
    });
    return [maxX - minX, maxY - minY, minX, minY, maxX, maxY];
  }, [props.combat]);

  const players = useMemo(() => {
    return _.values(props.combat.units).filter((u) => u.type === CombatUnitType.Player);
  }, [props.combat]);

  const deaths = _.flatten(players.map((p) => p.deathRecords)).sort((a, b) => a.timestamp - b.timestamp);

  return (
    <Box
      display="flex"
      flexDirection="column"
      className={
        clientContext.isDesktop
          ? `${styles['combat-report-replay-root']} ${styles['desktop']}`
          : styles['combat-report-replay-root']
      }
    >
      <Box display="flex" flexDirection="row" mx={2} alignItems="center">
        <Box mr={1}>
          <Tooltip title={paused ? t('combat-report-press-to-resume') : t('combat-report-press-to-pause')}>
            <Button
              type="text"
              size="middle"
              icon={paused ? <CaretRightFilled /> : <PauseOutlined />}
              onClick={() => {
                setPaused((prev) => {
                  return !prev;
                });
              }}
            />
          </Tooltip>
        </Box>
        <Box mr={2}>
          <ReplaySpeedDropdown speed={speed} setSpeed={setSpeed} />
        </Box>
        <Box mr={2}>
          <Button
            disabled={deaths.length === 0}
            title={t('combat-reports-press-to-goto-first-kill')}
            onClick={() => {
              setPaused(true);
              // + 1 added to timestamp here so the death event is guaranteed to show
              // on the replay events list
              setCurrentTimeOffset(deaths[0].timestamp - props.combat.startTime + 1);
              setSliderPos(deaths[0].timestamp - props.combat.startTime + 1);
            }}
          >
            <img
              alt={t('combat-reports-press-to-goto-first-kill')}
              src={`https://images.wowarenalogs.com/spells/237274.jpg`}
              style={{ display: 'block' }}
              width={22}
              height={22}
            />
          </Button>
        </Box>
        <Box flex={1} display="flex" flexDirection="column" justifyContent="center">
          <Slider
            min={0}
            max={props.combat.endTime - props.combat.startTime}
            value={sliderPos}
            step={100}
            tooltipVisible={false}
            onChange={updateSlider}
          />
        </Box>
        <Box ml={2}>
          <Text>{moment.utc(currentTimeOffset).format('mm:ss')}</Text>
        </Box>
        <Text type="secondary">
          &nbsp;
          {'/ ' + moment.utc(props.combat.endTime - props.combat.startTime).format('mm:ss')}
        </Text>
        {props.combat.wowVersion === 'retail' && (
          <ReplayDampeningTracker players={players} currentSecond={Math.floor(currentTimeOffset / 1000)} />
        )}
      </Box>
      <Box display="flex" flexDirection="row" alignItems="stretch" className={styles['combat-report-replay-container']}>
        <ReplayUnitFrames
          combat={props.combat}
          players={players}
          currentTimeOffset={currentTimeOffset}
          onClickUnit={(id) => setFilterEventsByPlayerId(id)}
        />
        <ReplayEvents
          currentTimeOffset={currentTimeOffset}
          filterByUnitId={filterEventsByPlayerId}
          setUnitIdFilter={setFilterEventsByPlayerId}
        />
        <div className={styles['combat-report-replay-area']} ref={initializeReplayContainerRef}>
          {replayContainerRef ? (
            <Stage
              width={replayContainerRef.clientWidth}
              height={replayContainerRef.clientHeight}
              options={{
                antialias: true,
                autoDensity: true,
              }}
              onMount={setPixiApp}
              onUnmount={() => {
                setPixiApp(null);
              }}
            >
              <ReplayViewport
                key={props.combat.id}
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
                      key={p.id}
                      combat={props.combat}
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
            </Stage>
          ) : null}
        </div>
      </Box>
    </Box>
  );
}
