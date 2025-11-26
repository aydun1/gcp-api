import { UUID } from 'crypto';

export interface DefinitivRole {
  roleAssignmentId: UUID;
  roleId: UUID;
  employmentTypeId: UUID;
  employmentTypeName: null;
  defaultShiftTypeId: UUID;
  defaultShiftTypeName: null;
  roleName: string;
  isPrimary: boolean;
  accreditedApprentice: boolean;
  accreditedTrainee: boolean;
  commencementDate: null;
  ceaseDate: null;
  awardPolicyId: UUID;
  payPolicyId: null;
  customPayPolicy: null;
  costingId: UUID;
  costingType: string;
  costingName: string;
}