import { UUID } from 'crypto';

export interface DefinitivOrg {
  organizationName: string;
  organizationFriendlyId: string;
  organizationId: UUID;
  organizationImage: string;
  userEmployeeId: UUID;
}