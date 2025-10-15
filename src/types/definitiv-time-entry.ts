import { UUID } from 'crypto';

export interface DefinitivBreak {
  description: string;
  startTimeOfDay: string;
  employeeSpecifiedStartTimeOfDay: string;
  endTimeOfDay: string;
  employeeSpecifiedEndTimeOfDay: string;
  durationHours: null;
  employeeSpecifiedDurationHours: null;
}

export interface DefinitivTimeEntry {
  projectId: UUID;
  roleId: UUID;
  departmentId: UUID;
  positionId: UUID;
  locationId: UUID;
  shiftTypeId: UUID;
  projectWorkOrderId: null;
  breaks: DefinitivBreak[];
  tasks: Array<any>;
  workOrderTasks: null;
  assets: null;
  notes: string;
  useTime: boolean;
  startTimeOfDay: string;
  endTimeOfDay: string;
  durationHours: null;
  customFields: Array<any>;
}