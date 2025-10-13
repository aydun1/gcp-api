import { UUID } from 'crypto';

export interface DefinitivProject {
  projectEmployeeId: UUID;
  projectId: UUID;
  projectName: string;
  employeeId: UUID;
  awardPolicy: null;
  payPolicy: null;
  projectWorkOrderId: null;
  usualPlaceOfResidenceId: null;
  commencementDate: null;
  ceaseDate: null;
  isPrimary: boolean;
  projectWorkOrderName: null;
  costingId: UUID;
  costingType: string;
  costingName: string;
}