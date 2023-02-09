export interface CwSearch {
  PageCount: number;
  RowCount: number;
  PageNumber: number;
  PageSize: number;
  Rows: [{
      Id: number;
      Name: string;
      CwNo: string;
      IsGold: boolean;
      MaterialData: 
        {
          Name: string;
          Value: string;
        }[]
      ;
  }];
}