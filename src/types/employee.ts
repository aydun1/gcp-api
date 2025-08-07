export interface Employee {
  employeeId: string;
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
    roleAssignmentId: string;
    role: {
      id: string;
      name: string;
    };
    employmentType: {
      id: string;
      name: string;
    };
    defaultShiftType: {
      id: string;
      name: string;
    };
    isPrimary: boolean;
    accreditedApprentice: boolean;
    accreditedTrainee: boolean;
    commencementDate: string;
    ceaseDate: string;
  }[];
  locations: {
    locationAssignmentId: string;
    location: {
      id: string;
      name: string;
    };
    isPrimary: boolean;
    commencementDate: string;
    ceaseDate: string;
  }[];
  departments: {
    departmentAssignmentId: string;
    department: {
      id: string;
      name: string;
    };
    isPrimary: boolean;
    commencementDate: string;
    ceaseDate: string;
  }[];
  employmentRecords: {
    employmentRecordId: string;
    hireDate: string;
    yearsOfServiceStartDate: string;
    hireReasonId: string;
    hireReasonName: string;
    hireComments: string;
    terminationDate: string;
    terminationTypeId: string;
    terminationTypeName: string;
    terminationReasonId: string;
    terminationReasonName: string;
    terminationComments: string;
    hasTermination: boolean;
  }[];
}
