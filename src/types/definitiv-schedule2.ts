import { UUID } from 'crypto';

interface DefinitivTimeEntry {
  projectId: null;
  roleId: null;
  departmentId: null;
  positionId: null;
  locationId: null;
  shiftTypeId: null;
  projectWorkOrderId: null;
  breaks: {
    description: string;
    startTimeOfDay: string;
    employeeSpecifiedStartTimeOfDay: null;
    endTimeOfDay: string;
    employeeSpecifiedEndTimeOfDay: null;
    durationHours: null;
    employeeSpecifiedDurationHours: null;
  }[];
  tasks: Array<any>;
  workOrderTasks: null;
  assets: null;
  notes: null;
  useTime: boolean;
  startTimeOfDay: string;
  endTimeOfDay: string;
  durationHours: null;
  customFields: Array<any>;
}

export interface DefinitivSchedule2 {
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