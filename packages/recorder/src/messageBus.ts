import { EventEmitter } from 'events';

import { VideoQueueItem } from './types';

export class ManagerMessageBus extends EventEmitter {
  public emit = (eventName: 'video-written', video: VideoQueueItem): boolean => {
    return super.emit(eventName, video);
  };

  public on = (eventName: 'video-written', listener: (video: VideoQueueItem) => void): this => {
    return super.on(eventName, listener);
  };
}
