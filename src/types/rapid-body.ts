import { UUID } from 'crypto';

export interface RapidBody {
  imageUrl: string;
  config: any;
  camera?: {
    id: UUID;
    hubId: UUID;
    name: string;
    dateCreated: string;
    lastUpdated: string;
  }
  location: {
    id: UUID;
    name: string;
    timezone: string; //'Australia/Brisbane'
    hubIds: Array<UUID>;
    dateCreated: string;
    lastUpdated: string;
  }
  users: Array<{name: string; email: string; dateCreated: string; lastUpdated: string;}>;
  profile: {
    id: UUID;
    name: string;
    email: string;
    phone: string;
    metadata: Array<any>;
    dateCreated: string;
    lastUpdated: string;
  }
  labels: {
    id: UUID;
    name: string;
    color: string;
    dateCreated: string;
    lastUpdated: string;
  }[];
  event: {
    id: UUID;
    topic: string;
    version: number;
    companyId: number;
    timestamp: string;
    serverTimestamp: string;
    data: {
      id: UUID;
      locationId: UUID;
      created: string;
      entry?: {
        source: 'USER' | 'SCHEDULER' | 'DOORKEEPER';
        timestamp: string;
      };
      exit?: {
        source: 'USER' | 'SCHEDULER' | 'DOORKEEPER';
        timestamp: string;
      };
      status: 'IN' | 'OUT';
      identityId: UUID;
      breaks?: [];
    }
  }
  webhookId: UUID;
  alternativeProfiles: Array<any>;
}
