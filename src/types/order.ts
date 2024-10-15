export interface Order {
  batchNumber: string;
  docDate: Date;
  reqShipDate: Date;
  locnCode: string;
  sopType: number;
  sopNumbe: string;
  origType: number;
  origNumber: string;
  custNumber: string;
  adrsCode: string;
  custName: string;
  cntPrsn: string;
  address1: string;
  address2: string;
  address3: string;
  city: string;
  state: string;
  postCode: string;
  phoneNumber1: string;
  phoneNumber2: string;
  shipMethod: string;
  posted: number;
  palletSpaces: number;
  orderWeight: number;
  note: string;
  pickStatus: number;
  custNmbr: string;
  deliveryStatus: string;
  deliveryRun: string;
  attachments: number;
}