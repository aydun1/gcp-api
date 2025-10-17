import { UUID } from 'crypto';

export interface DefinitivEvent {
  action: string;
  eventType: 'EmployeeModified' | 'EmployeeCreated';
  eventDateUtc: string;
  data: {
    employeeId: UUID;
    employeeNumber: string; // '810001',
    gender: 'Male' | 'Female';
    title: string;
    firstName: string;
    middleName: string;
    surname: string;
    preferredName: string;
    dateOfBirth: string;
    profilePictureUri: string;
    emailAddresses: Array<any>;
    streetAddresses: Array<any>;
    phoneNumbers: Array<any>;
    roles: Array<any>;
    projects: Array<any>;
    locations: Array<any>;
    departments: Array<any>;
    payPolicies: Array<any>;
    employmentRecords: Array<any>;
    assetAssignments: Array<any>;
    customFields: {
      shiftWorker: Array<any>;
      toilInsteadOfOT: Array<any>;
      annualLeaveLoading: Array<any>;
    }
  }
}

export interface DefinitivBody {
  eventCount: number;
  events: Array<DefinitivEvent>;
}