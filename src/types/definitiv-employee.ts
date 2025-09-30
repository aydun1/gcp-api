import { UUID } from 'crypto';

export interface DefinitivEmployee {
  organizationId: UUID;
  organizationName: string;
  employeeId: UUID;
  employeeFriendlyId: string;
  name: string;
  firstName: string;
  surname: string;
  preferredName: string;
  employeeNumber: string;
  gender: string;
  dateOfBirth: string;
  hiredDate: string;
  terminationDate: string;
  profilePictureUri: string;
  employmentStatus: string;
  canSubmitLeave: boolean;
  canSubmitTimesheets: boolean;
  terminated: boolean;
  taxNumber: string;
}
