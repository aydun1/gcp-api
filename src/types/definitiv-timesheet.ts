import { UUID } from 'crypto';

export interface DefinitivTimesheet {
  timesheetId: UUID;
  employeeId: UUID;
  employeeName: string;
  projectId: UUID;
  positionId: null;
  positionName: null;
  projectApprovalWorkflow: [];
  projectName: string;
  projectWorkOrderId: null;
  workOrderName: null;
  roleId: UUID;
  roleName: string;
  departmentId: UUID;
  departmentName: string;
  locationId: UUID;
  locationName: string;
  shiftTypeId: null;
  shiftTypeName: string;
  date: string; // 2025-07-09
  useTime: boolean;
  durationHours: null;
  employeeSpecifiedDurationHours: null;
  startTimeOfDay: string; // 06:00:00
  employeeSpecifiedStartTimeOfDay: null;
  endTimeOfDay: string; // 15:00:00
  employeeSpecifiedEndTimeOfDay: null;
  timePeriodAlerts: [];
  breaks: Array<any>;
  tasks: [];
  workOrderTasks: [];
  assets: [];
  notes: null;
  timePeriodMode: string;
  status: string;
  approvals: Array<any>;
  publicHolidayWorked: null;
  timeClockEvents: [];
  customFields: Array<any>;
  totalBreakHours: number;
  totalWorkedHours: number;
  allowEditing: boolean;
  submittedDateTime: Date;
  lastUpdated: Date;
}