import { Metadata } from './types';

/**
 * Abstract activity class.
 */
export default abstract class Activity {
  protected _startDate: Date;

  protected _endDate?: Date;

  protected _overrun: number = 0;

  constructor(startDate: Date) {
    this._startDate = startDate;
  }

  abstract getMetadata(): Metadata;
  abstract getFileName(): string;

  get startDate() {
    return this._startDate;
  }

  set startDate(date) {
    this._startDate = date;
  }

  get endDate() {
    return this._endDate;
  }

  set endDate(date) {
    this._endDate = date;
  }

  get overrun() {
    return this._overrun;
  }

  set overrun(s) {
    this._overrun = s;
  }

  get duration() {
    if (!this.endDate) {
      throw new Error('Failed to get duration of in-progress activity');
    }

    return (this.endDate.getTime() - this.startDate.getTime()) / 1000;
  }

  end(endDate: Date, result: boolean) {
    endDate.setTime(endDate.getTime());
    this.endDate = endDate;
  }
}
