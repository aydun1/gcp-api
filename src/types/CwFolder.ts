import { CwRow } from "./CwRow";

export interface CwFolder {
  PageCount: number;
  RowCount: number;
  PageNumber: number;
  PageSize: number;
  Rows: CwRow[]
}