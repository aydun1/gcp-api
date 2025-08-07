export interface RapidBody {
  config: {
  }
  location: {
    id: string;
    name: string;
    timezone: string;
    hubIds: Array<any>;
    dateCreated: string;
    lastUpdated: string;
  }
  users: Array<any>;
  profile: {
    id: string;
    name: string;
    email: string;
    phone: string;
    metadata: Array<any>;
    dateCreated: string;
    lastUpdated: string;
  }
  labels: Array<any>;
  event: {
    id: string;
    topic: string;
    version: number;
    companyId: number;
    timestamp: string;
    serverTimestamp: string;
    data: Array<any>;
  }
  webhookId: string;
  alternativeProfiles: Array<any>;
}
