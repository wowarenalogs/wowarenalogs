import { Metadata } from './types';

export interface IActivity {
  startDate: Date;
  endDate: Date;
  overrun: number;
  metadata?: Metadata;
  fileName: string;
}
