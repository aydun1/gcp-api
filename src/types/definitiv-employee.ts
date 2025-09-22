export interface DefinitiveEmployee {
  organizationId: string;
  organizationName: string;
  employeeId: string;
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
