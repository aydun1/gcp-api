import { UUID } from 'crypto';
import { DefinitivTimeEntry } from './definitiv-time-entry';

export interface DefinitivScheduleFull {
  workScheduleId: UUID;
  name: string;
  description: string;
  cycle: number;
  publicHolidayWorkedByDefault: boolean;
  useTime: boolean;
  useScheduledTime: boolean;
  dailySchedules: {
    timeEntries: Array<DefinitivTimeEntry>;
    leaveEntries: Array<any>;
  }[];
}