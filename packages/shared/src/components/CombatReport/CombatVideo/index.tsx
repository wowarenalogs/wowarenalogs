import { MouseEvent, useCallback, useEffect, useRef, useState } from 'react';

import { ArenaMatchMetadata, INativeBridge, ShuffleMatchMetadata } from '../../..';
import { useCombatReportContext } from '../CombatReportContext';
import styles from './index.module.css';

declare global {
  interface Window {
    wowarenalogs: INativeBridge;
  }
}

// TODO: Fix this typing.
// Forgot to add a few extra fields that are always present in the native side to the response type.
type FindVideoReturnShim =
  | {
      compensationTimeSeconds: number;
      videoPath: string;
      metadata: ArenaMatchMetadata | ShuffleMatchMetadata;
    }
  | undefined;

function getMatchTimeoffsetSeconds(
  matchId: string,
  metadata: ArenaMatchMetadata | ShuffleMatchMetadata,
  compensationTimeSeconds: number,
) {
  if (metadata.dataType == 'ShuffleMatchMetadata') {
    const roundOne = metadata.roundStarts.find((r) => r.sequenceNumber === 0);
    const roundInfo = metadata.roundStarts.find((r) => r.id === matchId);
    if (!roundOne || !roundInfo) return 0;
    const roundTimeOffset = (roundInfo.startInfo.timestamp - roundOne.startInfo.timestamp) / 1000;
    return roundTimeOffset + compensationTimeSeconds;
  } else {
    return compensationTimeSeconds;
  }
}

export const CombatVideo = () => {
  const rangeRef = useRef<HTMLInputElement>(null);
  const { combat } = useCombatReportContext();
  const [videoInformation, setVideoInformation] = useState<
    | { compensationTimeSeconds: number; videoPath: string; metadata: ArenaMatchMetadata | ShuffleMatchMetadata }
    | undefined
  >();
  const [vodNotFound, setVodNotFound] = useState(false);

  useEffect(() => {
    async function find() {
      if (window.wowarenalogs.obs?.findVideoForMatch && combat?.id) {
        const f = (await window.wowarenalogs.obs?.findVideoForMatch(
          'D:\\Video',
          combat.id,
        )) as unknown as FindVideoReturnShim;
        if (f) {
          if (f.metadata?.dataType) {
            // Since we are casting the metadata into a type from decoded JSON, we are a little more careful
            // about checking a field to make sure it looks like it's the right type
            setVideoInformation(f);
          } else {
            setVodNotFound(true);
          }
        } else {
          setVodNotFound(true);
        }
      }
    }
    find();
  }, [combat]);

  const vidRef = useRef<HTMLVideoElement>(null);

  const videoMathReady =
    combat?.id && videoInformation?.metadata && videoInformation.compensationTimeSeconds !== undefined;

  const matchStartTime = videoMathReady
    ? getMatchTimeoffsetSeconds(combat.id, videoInformation?.metadata, videoInformation?.compensationTimeSeconds || 0)
    : 0;

  // Set video playhead to start of round when it loads
  useEffect(() => {
    if (!combat) return;
    if (!videoInformation?.metadata) return;
    if (!vidRef.current) return;
    vidRef.current.currentTime =
      getMatchTimeoffsetSeconds(combat.id, videoInformation.metadata, videoInformation.compensationTimeSeconds || 0) ||
      0;
  }, [combat, videoInformation]);

  const rangeBarClick = useCallback(
    (e: MouseEvent<HTMLInputElement>) => {
      if (!vidRef.current) return;
      if (!rangeRef.current) return;
      vidRef.current.currentTime = parseFloat(e.currentTarget.value) + matchStartTime;
    },
    [matchStartTime],
  );

  const rangeBarDrag = useCallback(
    (e: MouseEvent<HTMLInputElement>) => {
      if (!vidRef.current) return;
      if (!rangeRef.current) return;
      if (!(e.buttons === 1)) return;
      vidRef.current.currentTime = parseFloat(e.currentTarget.value) + matchStartTime;
    },
    [matchStartTime],
  );

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    if (vidRef.current && rangeRef.current) {
      vidRef.current.addEventListener(
        'timeupdate',
        () => {
          if (!rangeRef.current) return;
          if (!vidRef.current) return;
          rangeRef.current.value = `${vidRef.current.currentTime - matchStartTime}`;
        },
        {
          signal,
        },
      );
    }

    return () => {
      controller.abort();
    };
  }, [combat?.durationInSeconds, matchStartTime, videoInformation]);

  if (vodNotFound) {
    return <div className="animate-fadein flex flex-col gap-2">No video found for this match!</div>;
  }
  if (!combat || !videoInformation) {
    return null;
  }

  return (
    <div className="animate-fadein flex flex-col gap-2 flex-1 h-full">
      <div className="flex flex-row gap-2">
        <div className="flex flex-col gap-2">
          <button
            className="btn"
            onClick={() => {
              if (!vidRef.current) return;
              if (!videoInformation.metadata) return;

              const offset = getMatchTimeoffsetSeconds(
                combat.id,
                videoInformation.metadata,
                videoInformation.compensationTimeSeconds || 0,
              );
              vidRef.current.currentTime = offset || 0;
              vidRef.current.play();
            }}
          >
            Start
          </button>
          <button
            className="btn"
            onClick={() => {
              if (!vidRef.current) return;
              if (!videoInformation.metadata) return;

              const offset = getMatchTimeoffsetSeconds(
                combat.id,
                videoInformation.metadata,
                videoInformation.compensationTimeSeconds || 0,
              );
              vidRef.current.currentTime = combat.durationInSeconds + offset - 5 || 0;
              vidRef.current.play();
            }}
          >
            Final 5s
          </button>
        </div>
        <video
          controls
          className={styles['vodPlayer']}
          id="video"
          ref={vidRef}
          // domain here looks weird but chrome will canonicalize the item in the string it thinks is the domain
          // which will lead to the b64 string losing its casing :(
          src={`vod://wowarenalogs/${btoa(videoInformation.videoPath)}`}
          style={{
            maxHeight: 'calc(100vh - 190px)', // TODO: MIGHTFIX figure out how to contain video without allowing scrollbars here
          }}
        />
      </div>
      <div className="slidecontainer w-full">
        <input
          ref={rangeRef}
          onClick={rangeBarClick}
          onMouseMove={rangeBarDrag}
          type="range"
          step={0.1}
          min="0"
          max={`${combat?.durationInSeconds}`}
          className="w-full"
        />
      </div>
    </div>
  );
};
