import EventEmitter from 'events';
import { tasklist } from 'tasklist';

type WowProcess = {
  exe: string;
};

/**
 * The Poller singleton periodically checks the list of WoW active processes.
 * If the state changes, it emits either a 'wowProcessStart' or
 * 'wowProcessStop' event.
 */
export default class Poller extends EventEmitter {
  private _isWowRunning = false;

  private _pollInterval: ReturnType<typeof setInterval> | undefined;

  private processRegex = new RegExp(/(wow(T|B|classic)?)\.exe/, 'i');

  private static _instance: Poller;

  static getInstance() {
    if (!Poller._instance) {
      Poller._instance = new Poller();
    }

    return Poller._instance;
  }

  static getInstanceLazy() {
    if (!Poller._instance) {
      throw new Error('[Poller] Must create poller first');
    }

    return Poller._instance;
  }

  private constructor() {
    super();
  }

  get isWowRunning() {
    return this._isWowRunning;
  }

  set isWowRunning(value) {
    this._isWowRunning = value;
  }

  get pollInterval() {
    return this._pollInterval;
  }

  set pollInterval(value) {
    this._pollInterval = value;
  }

  reset() {
    this.isWowRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  start() {
    this.reset();
    this.poll();
    this.pollInterval = setInterval(() => this.poll(), 5000);
  }

  private poll = async () => {
    const processList = await tasklist();

    // Tasklist package doesn't export types annoyingly, hence
    // the use of any here.
    const wowProcesses = processList
      .map((process: any) => process.imageName.match(this.processRegex))
      .filter((matches: string[]) => matches)
      .map(this.convertToWowProcessType);

    // We don't care to do anything better in the scenario of multiple
    // processes running. We don't support users multi-boxing.
    if (!this.isWowRunning && wowProcesses.pop()) {
      this.isWowRunning = true;
      this.emit('wowProcessStart');
    } else if (this.isWowRunning && !wowProcesses.pop()) {
      this.isWowRunning = false;
      this.emit('wowProcessStop');
    }
  };

  private convertToWowProcessType = (match: string[]) => {
    const wowProcessObject: WowProcess = {
      exe: match[0],
    };

    return wowProcessObject;
  };
}
