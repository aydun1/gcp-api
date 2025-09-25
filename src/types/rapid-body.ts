export interface RapidBody {
  config: {}
  location: {
    id: string;
    name: string;
    timezone: string;
    hubIds: Array<any>;
    dateCreated: string;
    lastUpdated: string;
  }
  users: Array<{name: string; email: string; dateCreated: string; lastUpdated: string;}>;
  profile: {
    id: string;
    name: string;
    email: string;
    phone: string;
    metadata: Array<any>;
    dateCreated: string;
    lastUpdated: string;
  }
  labels: Array<{id: string; name: string; color: string; dateCreated: string; lastUpdated: string;}>;
  event: {
    id: string;
    topic: string;
    version: number;
    companyId: number;
    timestamp: string;
    serverTimestamp: string;
    data: {
      id: string;
      locationId: string;
      created: string;
      entry: {source: string; timestamp: string};
      exit: {source: string; timestamp: string};
      status: string;
      identityId: string;
      breaks: Array<any>;
    }
  }
  webhookId: string;
  alternativeProfiles: Array<any>;
}
