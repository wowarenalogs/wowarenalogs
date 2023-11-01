import { MouseEvent, useCallback, useEffect, useRef, useState } from 'react';

import { ArenaMatchMetadata, INativeBridge, ShuffleMatchMetadata } from '../../..';
import { useCombatReportContext } from '../CombatReportContext';

declare global {
  interface Window {
    wowarenalogs: INativeBridge;
  }
}

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
  const progressBar = useRef<HTMLProgressElement>(null);
  const { combat } = useCombatReportContext();
  const [videoInformation, setVideoInformation] = useState<
    | { compensationTimeSeconds: number; videoPath: string; metadata: ArenaMatchMetadata | ShuffleMatchMetadata }
    | undefined
  >();
  const [vodNotFound, setVodNotFound] = useState(false);

  useEffect(() => {
    async function find() {
      if (window.wowarenalogs.obs?.findVideoForMatch && combat?.id) {
        const f = await window.wowarenalogs.obs?.findVideoForMatch('D:\\Video', combat.id);
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

  const progressBarClick = useCallback(
    (e: MouseEvent<HTMLProgressElement>) => {
      if (!vidRef.current) return;
      if (!progressBar.current) return;

      const rect = progressBar.current.getBoundingClientRect();
      const pos = (e.pageX - rect.left) / progressBar.current.clientWidth;
      vidRef.current.currentTime = (combat?.durationInSeconds || 0) * pos + matchStartTime;
    },
    [combat?.durationInSeconds, matchStartTime],
  );

  const progressBarDrag = useCallback(
    (e: MouseEvent<HTMLProgressElement>) => {
      if (!vidRef.current) return;
      if (!progressBar.current) return;
      if (!(e.buttons === 1)) return;
      const rect = progressBar.current.getBoundingClientRect();
      const pos = (e.pageX - rect.left) / progressBar.current.clientWidth;
      vidRef.current.currentTime = (combat?.durationInSeconds || 0) * pos + matchStartTime;
    },
    [combat?.durationInSeconds, matchStartTime],
  );

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    if (vidRef.current && progressBar.current) {
      vidRef.current.addEventListener(
        'timeupdate',
        () => {
          if (!progressBar.current) return;
          if (!vidRef.current) return;
          progressBar.current.setAttribute('max', `${combat?.durationInSeconds}` || '100');
          progressBar.current.value = vidRef.current.currentTime - matchStartTime;
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
          id="video"
          ref={vidRef}
          // domain here looks weird but chrome will canonicalize the item in the string it thinks is the domain
          // which will lead to the b64 string losing its casing :(
          src={`vod://wowarenalogs/${btoa(videoInformation.videoPath)}`}
          style={{
            maxHeight: 'calc(100vh - 240px)', // TODO: MIGHTFIX figure out how to contain video without allowing scrollbars here
          }}
        />
      </div>
      <div className="flex flex-row gap-2 items-center">
        <progress
          ref={progressBar}
          onClick={progressBarClick}
          onMouseMove={progressBarDrag}
          className="w-full"
          id="progress"
          value="0"
        >
          <span id="progress-bar"></span>
        </progress>
      </div>
    </div>
  );
};
