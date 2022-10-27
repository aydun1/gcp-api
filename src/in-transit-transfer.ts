import { InTransitTransferLine } from "./in-transit-transfer-line";

export interface InTransitTransfer {
  docId: string;
  fromSite: string;
  toSite: string;
  orderDate: string;
  lines: InTransitTransferLine[];
}