import { EventEmitter } from 'eventemitter3';

import { VideoQueueItem } from './types';

interface EventSpec {
  'video-written': (data: VideoQueueItem) => void;
}

export class ManagerMessageBus extends EventEmitter<EventSpec> {}
