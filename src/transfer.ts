export interface Transfer {
  id: string;
  fromSite: string;
  toSite: string;
  lines: {
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
  }[]
}