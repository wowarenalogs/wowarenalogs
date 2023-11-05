import { useEffect, useRef } from 'react';

import { useCombatReportContext } from '../CombatReportContext';
import { useVideoPlayerContext } from './VideoPlayerContext';

export const VideoPlayer = () => {
  const { combat } = useCombatReportContext();
  const { videoInformation, errorMessage, stateChanges, userInputs, combatTimeToVideoTime, videoTimeToCombatTime } =
    useVideoPlayerContext();
  const vidRef = useRef<HTMLVideoElement>(null);

  // Set video playhead to start of round when it loads
  useEffect(() => {
    if (!combat) return;
    if (!videoInformation?.metadata) return;
    if (!vidRef.current) return;

    vidRef.current.currentTime = combatTimeToVideoTime(combat.startTime);
  }, [combat, combatTimeToVideoTime, videoInformation]);

  // update the context provider about state changes
  useEffect(() => {
    const vid = vidRef.current;
    if (!vid) return;

    const controller = new AbortController();
    const signal = controller.signal;

    vid.addEventListener(
      'timeupdate',
      () => {
        stateChanges.emit('combatTime', videoTimeToCombatTime(vid.currentTime));
      },
      {
        signal,
      },
    );

    vid.addEventListener(
      'volumechange',
      () => {
        stateChanges.emit('volume', vid.volume);
      },
      {
        signal,
      },
    );

    vid.addEventListener(
      'canplay',
      () => {
        stateChanges.emit('playState', 'paused');
      },
      {
        signal,
      },
    );

    vid.addEventListener(
      'play',
      () => {
        stateChanges.emit('playState', 'playing');
      },
      {
        signal,
      },
    );

    vid.addEventListener(
      'pause',
      () => {
        stateChanges.emit('playState', 'paused');
      },
      {
        signal,
      },
    );

    vid.addEventListener(
      'ended',
      () => {
        stateChanges.emit('playState', 'paused');
      },
      {
        signal,
      },
    );

    return () => {
      controller.abort();
    };
  }, [stateChanges, videoInformation, videoTimeToCombatTime]);

  // listen to user inputs
  useEffect(() => {
    const onPlay = () => {
      if (!vidRef.current) return;
      vidRef.current.play();
    };
    const onPause = () => {
      if (!vidRef.current) return;
      vidRef.current.pause();
    };
    const onJumpToCombatTime = (combatTime: number) => {
      if (!vidRef.current) return;
      vidRef.current.currentTime = combatTimeToVideoTime(combatTime);
    };
    const onSetVolume = (volume: number) => {
      if (!vidRef.current) return;
      vidRef.current.volume = volume;
    };

    userInputs.on('play', onPlay);
    userInputs.on('pause', onPause);
    userInputs.on('jumpToCombatTime', onJumpToCombatTime);
    userInputs.on('setVolume', onSetVolume);

    return () => {
      userInputs.off('play', onPlay);
      userInputs.off('pause', onPause);
      userInputs.off('jumpToCombatTime', onJumpToCombatTime);
      userInputs.off('setVolume', onSetVolume);
    };
  }, [combatTimeToVideoTime, userInputs]);

  if (errorMessage) {
    return <div className="animate-fadein flex flex-col gap-2">{errorMessage}</div>;
  }
  if (!combat || !videoInformation) {
    return null;
  }

  return (
    <video
      id="video"
      ref={vidRef}
      controls={false}
      // domain here looks weird but chrome will canonicalize the item in the string it thinks is the domain
      // which will lead to the b64 string losing its casing :(
      src={`vod://wowarenalogs/${btoa(videoInformation.videoPath)}`}
    />
  );
};
