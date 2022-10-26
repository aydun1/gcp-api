import { InTransitTransferLine } from "./in-transit-transfer-line";

export interface InTransitTransfer {
  id: string;
  fromSite: string;
  toSite: string;
  lines: InTransitTransferLine[];
}