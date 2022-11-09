export interface Line {
  id: number;
  poNumber: string;
  reqDate: string;
  itemDesc: string;
  itemNumber: string;
  lineNumber: string;
  orderQty: number;
  cancelledQty: number;
  extendedCost: number;
  toTransfer: number;
}