import EventEmitter from 'events';
import child_process from 'child_process';

function isTaskRunning(taskMatcher: RegExp) {
  const promise = new Promise<boolean>((resolve, reject) => {
    child_process.exec('tasklist', function (err, stdout, stderr) {
      if (err) {
        reject(err);
      }
      if (taskMatcher.test(stdout)) {
        resolve(true);
      } else {
        resolve(false);
      }
      // stdout is a string containing the output of the command.
    });
  });
  return promise;
}

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
    const isNowRunning = await isTaskRunning(this.processRegex);

    if (!this.isWowRunning && isNowRunning) {
      this.isWowRunning = true;
      this.emit('wowProcessStart');
    } else if (this.isWowRunning && !isNowRunning) {
      this.isWowRunning = false;
      this.emit('wowProcessStop');
    }
  };
}
