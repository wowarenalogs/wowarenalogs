import { VideoPlayer } from './VideoPlayer';
import { VideoPlayerContextProvider } from './VideoPlayerContext';
import { VideoPlayerTimeline } from './VideoPlayerTimeline';

export const CombatVideo = () => {
  return (
    <VideoPlayerContextProvider>
      <div className="flex flex-col gap-2">
        <VideoPlayerTimeline />
        <VideoPlayer />
      </div>
    </VideoPlayerContextProvider>
  );
};
