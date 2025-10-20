import { UUID } from 'crypto';

export interface DefinitivEvent {
  action: string;
  eventType: 'EmployeeModified' | 'EmployeeCreated' | 'EmployeeDeleted';
  eventDateUtc: string;
  data: {
    employeeId: UUID;
    employeeNumber: string; // '810001'
    gender: 'Male' | 'Female';
    title: string;
    firstName: string;
    middleName: string;
    surname: string;
    preferredName: string;
    dateOfBirth: string;
    profilePictureUri: string;
    emailAddresses: {
      type: 'PrimaryEmail';
      value: string;
    }[];
    streetAddresses: {
      type: 'HomeAddress';
      street: string;
      suburb: string;
      state: string;
      postCode: string;
      countryCode: string;
    }[];
    phoneNumbers: {
      type: 'MobilePhone';
      value: string;
    }[];
    roles: {
      roleAssignmentId: UUID;
      role: {
        id: UUID;
        name: string;
      }
      employmentType: {
        id: UUID;
        name: string;
      }
      defaultShiftType: unknown;
      isPrimary: boolean;
      accreditedApprentice: boolean;
      accreditedTrainee: boolean;
      commencementDate: string;
      ceaseDate: string;
      awardPolicyId: UUID;
      payPolicyId: UUID;
      customPayPolicy: unknown;
    }[];
    projects: {
      projectEmployeeId: UUID;
      project: {
        id: UUID;
        name: 'KID'
      }
      employeeId: UUID;
      awardPolicy: unknown;
      payPolicy: unknown;
      projectWorkOrder: unknown;
      usualPlaceOfResidenceId: UUID;
      commencementDate: string;
      ceaseDate: string;
      isPrimary: boolean;
      projectWorkOrderName: string;
    }[];
    locations: {
      locationAssignmentId: UUID;
      location: {
        id: UUID;
        name: string;
      }
      isPrimary: boolean;
      commencementDate: string;
      ceaseDate: string;
    }[];
    departments: {
      departmentAssignmentId: UUID;
      department: {
        id: UUID;
        name: string;
      }
      isPrimary: boolean;
      commencementDate: string;
      ceaseDate: string;
    }[];
    payPolicies: {
      payPolicyAssignmentId: UUID;
      payPolicy: unknown;
      commencementDate: string;
      ceaseDate: string;
      customPayPolicy: {
        customPayPolicyId: UUID;
        name: string;
        baseRate: Array<unknown>;
        payRates: Array<unknown>;
        payRateRules: Array<unknown>;
      }
    }[];
    employmentRecords: {
      employmentRecordId: UUID;
      hireDate: string;
      yearsOfServiceStartDate: string;
      hireReasonId: UUID;
      hireReasonName: string;
      hireComments: string;
      terminationDate: string;
      terminationTypeId: UUID;
      terminationTypeName: string;
      terminationReasonId: UUID;
      terminationReasonName: string;
      terminationComments: string;
      hasTermination: boolean;
    }[];
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