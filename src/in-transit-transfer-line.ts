export interface InTransitTransferLine {
  Id: number;
  DocId: string;
  FromSite: string;
  ToSite: string;
  OrderDate: string;
  ItemDesc: string;
  ItemNmbr: string;
  lineNumber: string;
  orderQty: number;
  cancelledQty: number;
  extendedCost: number;
  toTransfer: number;
}