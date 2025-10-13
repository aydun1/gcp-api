import { UUID } from 'crypto';

export interface DefinitivSchedule {
  workScheduleAssignmentId: UUID;
  workScheduleId: UUID;
  positionId: UUID;
  customWorkSchedule: any;
  commencementDate: string;
  ceaseDate: string;
  periodStartDate: string;
}