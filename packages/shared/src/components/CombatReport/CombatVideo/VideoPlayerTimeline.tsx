import { CombatUnitType } from '@wowarenalogs/parser';
import _ from 'lodash';
import moment from 'moment';
import { useCallback, useEffect, useMemo } from 'react';
import { FaSkullCrossbones } from 'react-icons/fa';
import { TbPlayerPause, TbPlayerPlay } from 'react-icons/tb';

import { useCombatReportContext } from '../CombatReportContext';
import { useVideoPlayerContext } from './VideoPlayerContext';

export const VideoPlayerTimeline = () => {
  const { combat } = useCombatReportContext();
  const { playState, userInputs, combatTime } = useVideoPlayerContext();

  const players = useMemo(() => {
    return _.values(combat ? combat.units : []).filter((u) => u.type === CombatUnitType.Player);
  }, [combat]);

  const deaths = useMemo(
    () => _.flatten(players.map((p) => p.deathRecords)).sort((a, b) => a.timestamp - b.timestamp),
    [players],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        playState === 'playing' ? userInputs.emit('pause') : userInputs.emit('play');
      }
    };
    window.addEventListener('keyup', onKey);

    return () => {
      window.removeEventListener('keyup', onKey);
    };
  }, [playState, userInputs]);

  useEffect(() => {
    if (combat && combatTime >= combat.endTime) {
      userInputs.emit('pause');
    }
  }, [combat, combatTime, userInputs]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedJump = useCallback(
    _.debounce((time: number) => {
      userInputs.emit('pause');
      userInputs.emit('jumpToCombatTime', time);
    }, 100),
    [userInputs],
  );

  if (!combat) {
    return null;
  }

  return (
    <div className="flex flex-row mx-2 items-center mb-2">
      <div className="mr-1">
        <div
          className="tooltip"
          data-tip={playState === 'paused' ? 'Press Spacebar To Resume' : 'Press Spacebar To Pause'}
        >
          <button
            className="btn btn-ghost btn-sm"
            disabled={playState === 'init' || playState === 'error'}
            onClick={() => {
              playState === 'playing' ? userInputs.emit('pause') : userInputs.emit('play');
            }}
          >
            {playState === 'playing' ? <TbPlayerPause /> : <TbPlayerPlay />}
          </button>
        </div>
      </div>
      <div className="mr-2">
        <div className="tooltip" data-tip="Jump to First Blood">
          <button
            className="btn btn-sm btn-ghost"
            disabled={deaths.length === 0}
            onClick={() => {
              userInputs.emit('jumpToCombatTime', deaths[0].timestamp - 5000);
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
          value={combatTime - combat.startTime}
          step={100}
          onChange={(e) => {
            debouncedJump(e.target.valueAsNumber + combat.startTime);
          }}
        />
      </div>
      <div className="ml-2">{moment.utc(combatTime - combat.startTime).format('mm:ss')}</div>
      <div className="opacity-60 mr-2">
        &nbsp;
        {'/ ' + moment.utc(combat.endTime - combat.startTime).format('mm:ss')}
      </div>
    </div>
  );
};
