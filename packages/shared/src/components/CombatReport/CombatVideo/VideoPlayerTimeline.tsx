import { CombatUnitType } from '@wowarenalogs/parser';
import _ from 'lodash';
import moment from 'moment';
import { useCallback, useEffect, useMemo } from 'react';
import { FaSkullCrossbones } from 'react-icons/fa';
import { TbPlayerPause, TbPlayerPlay, TbVolume, TbVolumeOff } from 'react-icons/tb';

import { useCombatReportContext } from '../CombatReportContext';
import { useVideoPlayerContext } from './VideoPlayerContext';

const RECORDING_OVERRUN = 3000;

export const VideoPlayerTimeline = () => {
  const { combat } = useCombatReportContext();
  const { playState, userInputs, combatTime, volume } = useVideoPlayerContext();

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
    if (combat && combatTime >= combat.endTime + RECORDING_OVERRUN) {
      userInputs.emit('pause');
    }
  }, [combat, combatTime, userInputs]);

  const jump = useCallback(
    (time: number) => {
      userInputs.emit('pause');
      userInputs.emit('jumpToCombatTime', time);
    },
    [userInputs],
  );

  if (!combat) {
    return null;
  }

  return (
    <div className="flex flex-row gap-1 mx-2 items-center mb-2">
      <button
        className="btn btn-sm btn-ghost"
        title={playState === 'paused' ? 'Press Spacebar To Resume' : 'Press Spacebar To Pause'}
        disabled={playState === 'error'}
        onMouseDown={(e) => {
          e.preventDefault(); // prevent the button from acquiring focus which intercepts spacebar key presses
        }}
        onClick={() => {
          playState === 'playing' ? userInputs.emit('pause') : userInputs.emit('play');
        }}
      >
        {playState === 'playing' ? <TbPlayerPause /> : <TbPlayerPlay />}
      </button>
      <button
        className="btn btn-sm btn-ghost"
        title={volume === 0 ? 'Turn on audio' : 'Turn off audio'}
        disabled={playState === 'error'}
        onMouseDown={(e) => {
          e.preventDefault(); // prevent the button from acquiring focus which intercepts spacebar key presses
        }}
        onClick={() => {
          userInputs.emit('setVolume', volume === 0 ? 1 : 0);
        }}
      >
        {volume === 0 ? <TbVolumeOff /> : <TbVolume />}
      </button>
      <button
        className="btn btn-sm btn-ghost"
        title="Jump to First Blood"
        disabled={deaths.length === 0}
        onMouseDown={(e) => {
          e.preventDefault(); // prevent the button from acquiring focus which intercepts spacebar key presses
        }}
        onClick={() => {
          userInputs.emit('jumpToCombatTime', deaths[0].timestamp - 3000);
        }}
      >
        <FaSkullCrossbones />
      </button>
      <div className="flex-1 flex flex-col justify-center">
        <input
          type="range"
          className="range range-sm"
          min={0}
          max={combat.endTime - combat.startTime + RECORDING_OVERRUN}
          value={combatTime - combat.startTime}
          step={1000}
          onChange={(e) => {
            jump(e.target.valueAsNumber + combat.startTime);
          }}
        />
      </div>
      <div>{moment.utc(combatTime - combat.startTime).format('mm:ss')}</div>
      <div className="opacity-60">
        {'/ ' + moment.utc(combat.endTime + RECORDING_OVERRUN - combat.startTime).format('mm:ss')}
      </div>
    </div>
  );
};
