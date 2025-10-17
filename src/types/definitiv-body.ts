export interface DefinitivEvent {
  action: string;
  eventType: 'EmployeeModified' | 'EmployeeCreated';
  eventDateUtc: string;
  data: any[];
}

export interface DefinitivBody {
  eventCount: number;
  events: Array<DefinitivEvent>;
}