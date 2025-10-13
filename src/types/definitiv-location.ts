import { UUID } from 'crypto';

export interface DefinitivLocation {
  locationAssignmentId: UUID;
  locationId: UUID;
  locationName: string;
  isPrimary: boolean;
  commencementDate: null;
  ceaseDate: null;
  costingId: UUID;
  costingType: string;
  costingName: string;
}