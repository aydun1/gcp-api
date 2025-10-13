import { UUID } from 'crypto';

export interface DefinitivDepartment {
  departmentAssignmentId: UUID;
  departmentId: UUID;
  isPrimary: true;
  commencementDate: null;
  ceaseDate: null;
  costingId: UUID;
  costingType: string;
  costingName: string;
}