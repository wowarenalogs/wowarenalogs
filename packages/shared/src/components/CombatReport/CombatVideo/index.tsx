import { useEffect, useRef, useState } from 'react';

import { ArenaMatchMetadata, INativeBridge, ShuffleMatchMetadata } from '../../..';
import { useCombatReportContext } from '../CombatReportContext';

declare global {
  interface Window {
    wowarenalogs: INativeBridge;
  }
}

// TODO: What does this value represent? Where should we store it?
// Downgraded this from MUSTFIX to just a todo. This will need more exploration.
const MATCH_START_CORRECTION = 0;
// I have observed correct values for this between 1 - 2.75s
// it appears to be some discrepency between the combat log timestamps and system clock?

function getMatchTimeoffsetSeconds(matchId: string, metadata: ArenaMatchMetadata | ShuffleMatchMetadata) {
  if (metadata.dataType == 'ShuffleMatchMetadata') {
    const roundOne = metadata.roundStarts.find((r) => r.sequenceNumber === 0);
    const roundInfo = metadata.roundStarts.find((r) => r.id === matchId);
    if (!roundOne || !roundInfo) return;
    const roundTimeOffset = (roundInfo.startInfo.timestamp - roundOne.startInfo.timestamp) / 1000;
    return roundTimeOffset + MATCH_START_CORRECTION;
  } else {
    return MATCH_START_CORRECTION;
  }
}

export const CombatVideo = () => {
  const { combat } = useCombatReportContext();
  const [foundVodRef, setFoundVodRef] = useState<
    { videoPath: string; metadata: ArenaMatchMetadata | ShuffleMatchMetadata } | undefined
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
            setFoundVodRef(f);
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

  useEffect(() => {
    if (!combat) return;
    if (!foundVodRef?.metadata) return;
    if (!vidRef.current) return;
    vidRef.current.currentTime = getMatchTimeoffsetSeconds(combat.id, foundVodRef.metadata) || MATCH_START_CORRECTION;
  }, [combat, foundVodRef]);

  if (vodNotFound) {
    return <div className="animate-fadein flex flex-col gap-2">No video found for this match!</div>;
  }
  if (!combat || !foundVodRef) {
    return null;
  }

  return (
    <div className="animate-fadein flex flex-col gap-2 flex-1 h-full">
      <button
        className="btn"
        onClick={() => {
          if (!vidRef.current) return;
          if (!foundVodRef.metadata) return;

          const offset = getMatchTimeoffsetSeconds(combat.id, foundVodRef.metadata);
          vidRef.current.currentTime = offset || MATCH_START_CORRECTION;
          vidRef.current.play();
        }}
      >
        Play from start of round
      </button>
      <video
        controls
        id="video"
        ref={vidRef}
        // domain here looks weird but chrome will canonicalize the item in the string it thinks is the domain
        // which will lead to the b64 string losing its casing :(
        src={`vod://wowarenalogs/${btoa(foundVodRef.videoPath)}`}
        style={{
          maxHeight: 'calc(100vh - 200px)', // TODO: MIGHTFIX figure out how to contain video without allowing scrollbars here
        }}
      />
    </div>
  );
};
