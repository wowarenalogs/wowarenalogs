import { VideoPlayer } from './VideoPlayer';
import { VideoPlayerContextProvider } from './VideoPlayerContext';
import { VideoPlayerEventsPanel } from './VideoPlayerEventsPanel';
import { VideoPlayerTimeline } from './VideoPlayerTimeline';

export const CombatVideo = () => {
  return (
    <VideoPlayerContextProvider>
      <div className="flex flex-col gap-2">
        <VideoPlayerTimeline />
        <div className="flex gap-4">
          <div className="flex-1">
            <VideoPlayer />
          </div>
          <div className="relative" style={{ width: '320px' }}>
            <VideoPlayerEventsPanel />
          </div>
        </div>
      </div>
    </VideoPlayerContextProvider>
  );
};
