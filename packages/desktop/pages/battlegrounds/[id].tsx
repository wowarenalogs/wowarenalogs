import { ArenaMatchMetadata, ShuffleMatchMetadata } from '@wowarenalogs/shared';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

type FindVideoReturnShim =
  | {
      compensationTimeSeconds: number;
      relativeStart: number;
      videoPath: string;
      metadata: ArenaMatchMetadata | ShuffleMatchMetadata;
    }
  | undefined;

const Page = () => {
  const router = useRouter();
  const { id } = router.query;
  const combatId = id?.toString();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoInformation, setVideoInformation] = useState<FindVideoReturnShim | null>(null);

  useEffect(() => {
    async function find() {
      if (window.wowarenalogs.obs?.findVideoForMatch && combatId) {
        const config = await window.wowarenalogs.obs?.getConfiguration?.();
        if (!config) {
          setErrorMessage('OBS configuration not loaded. Please visit settings and enable the OBS engine.');
          return;
        }
        const f = (await window.wowarenalogs.obs?.findVideoForMatch(
          config?.storagePath,
          combatId,
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
  }, [combatId]);

  if (errorMessage) return <div>{errorMessage}</div>;
  if (!videoInformation) return null;

  return (
    <div>
      <video id="video" controls src={`vod://wowarenalogs/${btoa(videoInformation.videoPath)}`} />
    </div>
  );
};

export default Page;
