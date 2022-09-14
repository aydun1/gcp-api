export interface Transfer {
  fromSite: string;
  toSite: string,
  lines: {
    id: number;
    poNumber: string;
    reqDate: string;
    itemDesc: string;
    itemNumber: string;
    orderQty: number;
    extendedCost: number;
    toTransfer: number;
  }[]
}