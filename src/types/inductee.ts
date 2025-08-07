export interface Inductee {
  inducteeId?: 0,
  userType: 0 | 1;
  personnelTypeId: number;
  secondaryPersonnelTypeIds?: number[];
  siteIds: number[];
  departmentId?: number;
  allowToAddCourses?: boolean;
  sendPassword?: boolean;
  ccEmail?: string;
  responsibleAdminId?: 0;
  contractorId?: 0;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  mobile?: string;
  mobileCountryCode?: string;
  employeeId?: string;
  securityId?: string;
}