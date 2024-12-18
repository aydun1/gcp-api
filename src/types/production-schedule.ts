export interface ProductionSchedule {
  JobSeq: number;
  jobNumber: string;
  StartTime: number;
  StopTime: number;
  SchedStart: number;
  SchedStop: number;
  SchedQty: number;
  CustomerID: string;
  JobType: number;
  MiscInfo1: string;
  MiscInfo2: string;
  Status: number;
  MachID: string;
  MachDesc: string;
  ItemNumber: string;
  StatusDesc: string;
  PcsPerCtn: number;
  CurrentStartTime: number;
  MostRecentStartTime: number;
  remainingQty: number;
}

