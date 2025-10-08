import { UUID } from 'crypto';

export interface Employee {
  employeeId: UUID;
  employeeNumber: string;
  gender: string;
  title: string;
  firstName: string;
  middleName: string;
  surname: string;
  preferredName: string;
  dateOfBirth: string;
  profilePictureUri: string;
  emailAddresses: {
    type: string;
    value: string;
  }[];
  streetAddresses: {
    type: string;
    street: string;
    suburb: string;
    state: string;
    postCode: string;
    countryCode: string;
  }[];
  phoneNumbers: {
    type: string;
    value: string;
  }[];
  roles: {
    roleAssignmentId: UUID;
    role: {
      id: UUID;
      name: string;
    };
    employmentType: {
      id: UUID;
      name: string;
    };
    defaultShiftType: {
      id: UUID;
      name: string;
    };
    isPrimary: boolean;
    accreditedApprentice: boolean;
    accreditedTrainee: boolean;
    commencementDate: string;
    ceaseDate: string;
  }[];
  locations: {
    locationAssignmentId: UUID;
    location: {
      id: UUID;
      name: string;
    };
    isPrimary: boolean;
    commencementDate: string;
    ceaseDate: string;
  }[];
  departments: {
    departmentAssignmentId: UUID;
    department: {
      id: UUID;
      name: string;
    };
    isPrimary: boolean;
    commencementDate: string;
    ceaseDate: string;
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
}
