import { EventEmitter } from 'eventemitter3';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { ArenaMatchMetadata, ShuffleMatchMetadata } from '../../../types/metadata';
import { useCombatReportContext } from '../CombatReportContext';

/* eslint-disable no-console */

export type VideoPlayerPlayState = 'playing' | 'paused' | 'error';

interface VideoPlayerUserInputSpec {
  play: () => void;
  pause: () => void;
  jumpToCombatTime: (combatTime: number) => void;
  setVolume: (volume: number) => void;
}

interface VideoPlayerStateChangesSpec {
  playState: (playState: VideoPlayerPlayState) => void;
  combatTime: (combatTime: number) => void;
  volume: (volume: number) => void;
}

type VideoPlayerContextType = {
  userInputs: EventEmitter<VideoPlayerUserInputSpec>;
  stateChanges: EventEmitter<VideoPlayerStateChangesSpec>;

  playState: VideoPlayerPlayState;
  combatTime: number;
  volume: number;

  videoInformation: FindVideoReturnShim | null;
  errorMessage: string | null;

  combatTimeToVideoTime: (combatTime: number) => number;
  videoTimeToCombatTime: (videoTime: number) => number;
};

export const VideoPlayerContext = createContext<VideoPlayerContextType>({
  userInputs: new EventEmitter(),
  stateChanges: new EventEmitter(),

  playState: 'paused',
  combatTime: 0,
  volume: 1,

  videoInformation: null,
  errorMessage: null,

  combatTimeToVideoTime: () => 0,
  videoTimeToCombatTime: () => 0,
});

// TODO: Fix this typing.
// Forgot to add a few extra fields that are always present in the native side to the response type.
type FindVideoReturnShim =
  | {
      compensationTimeSeconds: number;
      relativeStart: number;
      recordingStartWallClockMs?: number;
      recordingStopWallClockMs?: number;
      recordingBacktrackRequestedSeconds?: number;
      recordingBacktrackEffectiveSeconds?: number;
      recordingCutStartSeconds?: number;
      recordingFirstKeyframeTimeSeconds?: number;
      recordingFirstKeyframeWallClockMs?: number;
      recordingBufferDurationSeconds?: number;
      recordingBufferStartWallClockMs?: number;
      videoPath: string;
      metadata: ArenaMatchMetadata | ShuffleMatchMetadata;
    }
  | undefined;

export const VideoPlayerContextProvider = ({ children }: { children: ReactNode }) => {
  const { combat } = useCombatReportContext();
  const [playState, setPlayState] = useState<VideoPlayerPlayState>('paused');
  const [combatTime, setCombatTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userInputs, setUserInputs] = useState(new EventEmitter<VideoPlayerUserInputSpec>());
  const [stateChanges, setStateChanges] = useState(new EventEmitter<VideoPlayerStateChangesSpec>());
  const [videoInformation, setVideoInformation] = useState<FindVideoReturnShim | null>(null);

  // reset the context when switching to a new combat
  useEffect(() => {
    const newUserInputs = new EventEmitter<VideoPlayerUserInputSpec>();
    const newStateChanges = new EventEmitter<VideoPlayerStateChangesSpec>();

    setUserInputs(newUserInputs);
    setStateChanges(newStateChanges);

    newStateChanges.on('playState', (newPlayState) => {
      setPlayState(newPlayState);
    });
    newStateChanges.on('combatTime', (newCombatTime) => {
      setCombatTime(newCombatTime);
    });
    newStateChanges.on('volume', (newVolume) => {
      setVolume(newVolume);
    });

    return () => {
      newUserInputs.removeAllListeners();
      newStateChanges.removeAllListeners();
    };
  }, [combat]);

  // find video for the current combat
  useEffect(() => {
    async function find() {
      if (window.wowarenalogs.obs?.findVideoForMatch && combat?.id) {
        const config = await window.wowarenalogs.obs?.getConfiguration?.();
        if (!config) {
          setErrorMessage('OBS configuration not loaded. Please visit settings and enable the OBS engine.');
          return;
        }
        const f = (await window.wowarenalogs.obs?.findVideoForMatch(
          config?.storagePath,
          combat.id,
        )) as FindVideoReturnShim;
        if (f) {
          if (f.metadata?.dataType) {
            // Since we are casting the metadata into a type from decoded JSON, we are a little more careful
            // about checking a field to make sure it looks like it's the right type
            setVideoInformation(f);
            setErrorMessage(null);
          } else {
            setErrorMessage(`No video found for this match in ${config?.storagePath}`);
          }
        } else {
          setErrorMessage(`No video found for this match in ${config?.storagePath}`);
        }
      }
    }
    find();
  }, [combat]);

  const combatTimeToVideoTime = useCallback(
    (combatTime: number) => {
      if (!videoInformation || videoInformation.compensationTimeSeconds === undefined) return 0;

      const metadata = videoInformation.metadata; // this is either a regular match or an entire shuffle
      const baseStartTime = combat?.startTime ?? metadata.startTime;
      console.log('ctime', combatTime);

      if (
        videoInformation.recordingBufferStartWallClockMs !== undefined &&
        videoInformation.recordingCutStartSeconds !== undefined
      ) {
        return Math.max(
          0,
          (combatTime - videoInformation.recordingBufferStartWallClockMs) / 1000 -
            videoInformation.recordingCutStartSeconds,
        );
      }

      if (
        videoInformation.recordingFirstKeyframeWallClockMs !== undefined &&
        videoInformation.recordingFirstKeyframeTimeSeconds !== undefined
      ) {
        return Math.max(
          0,
          videoInformation.recordingFirstKeyframeTimeSeconds +
            (combatTime - videoInformation.recordingFirstKeyframeWallClockMs) / 1000,
        );
      }

      return Math.max(0, (combatTime - baseStartTime) / 1000 + videoInformation.compensationTimeSeconds);
    },
    [combat?.startTime, videoInformation],
  );

  console.log({
    combatTimeToVideoTimeAtCombatStart: combat ? combatTimeToVideoTime(combat.startTime) : null,
  });
  console.log('combatTimeToVideoTime at 1771973076449: ', combatTimeToVideoTime(1771973076449));
  console.log({ combat });

  const videoTimeToCombatTime = useCallback(
    (videoTime: number) => {
      console.log('vtime', videoTime);
      if (!videoInformation || videoInformation.compensationTimeSeconds === undefined) return 0;

      const metadata = videoInformation.metadata;
      const baseStartTime = combat?.startTime ?? metadata.startTime;

      if (
        videoInformation.recordingBufferStartWallClockMs !== undefined &&
        videoInformation.recordingCutStartSeconds !== undefined
      ) {
        return Math.max(
          0,
          videoInformation.recordingBufferStartWallClockMs +
            (videoInformation.recordingCutStartSeconds + videoTime) * 1000,
        );
      }

      if (
        videoInformation.recordingFirstKeyframeWallClockMs !== undefined &&
        videoInformation.recordingFirstKeyframeTimeSeconds !== undefined
      ) {
        return Math.max(
          0,
          videoInformation.recordingFirstKeyframeWallClockMs +
            (videoTime - videoInformation.recordingFirstKeyframeTimeSeconds) * 1000,
        );
      }

      return Math.max(0, (videoTime - videoInformation.compensationTimeSeconds) * 1000 + baseStartTime);
    },
    [combat?.startTime, videoInformation],
  );

  console.log({
    videoInformation,
    combatStart: combat?.startTime,
    metadataStart: videoInformation?.metadata?.startTime,
    combatMetaDelta: (combat?.startTime ?? 0) - (videoInformation?.metadata?.startTime ?? 0),
    combatWallClockDelta: (combat?.startTime ?? 0) - (videoInformation?.recordingStartWallClockMs ?? 0),
    combat0: combatTimeToVideoTime(0),
    video0: videoTimeToCombatTime(0),
  });

  return (
    <VideoPlayerContext.Provider
      value={{
        userInputs,
        stateChanges,
        playState,
        combatTime,
        volume,
        videoInformation,
        errorMessage,
        combatTimeToVideoTime,
        videoTimeToCombatTime,
      }}
    >
      {children}
    </VideoPlayerContext.Provider>
  );
};

export const useVideoPlayerContext = () => {
  return useContext(VideoPlayerContext);
};
