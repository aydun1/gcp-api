export interface EnvuReceipt {
  shipmentNoteType: 'Goods Issued Note';
  shipmentNoteNumber: string;
  sourcePartnerId: string;
  destinationPartnerId: string;
  sourceDivisionId: string;
  destinationDivisionId: string;
  schemaVersion: string;
  trackingId: string;
  docCreated: Date
  docTrackingId: string;
  docRevisionNumber: string;
  purchaseOrderNumber: string;
  salesOrderNumber: string;
  shipmentNoteDate: Date;
  expectedDeliveryDate: Date;
  dateDispatched: Date;
  soldToCode: string;
  soldToName: string;
  soldToAddress1: string;
  soldToAddress2: string;
  soldToAddress3: string;
  soldToSuburb: string;
  soldToState: string;
  soldToPostcode: string;
  soldToCountry: string;
  soldToContactName: string;
  soldToContactPhone:string; 
  soldToContactEmail: string;
  shipToName: string;
  shipToCode: string;
  shipToAddress1: string;
  shipToAddress2: string;
  shipToAddress3: string;
  shipToPostcode: string;
  shipToSuburb: string;
  shipToState: string;
  shipToCountry: string;
  shipToContactName: string;
  shipToContactPhone: string;
  deliveryType: string;
  shippingInstructions: string;
  carrierName: string;
  carrierCode: string;
  carrierAddress1: string;
  carrierAddress2: string;
  carrierAddress3: string;
  carrierPostcode: string;
  carrierSuburb: string;
  carrierState: string;
  carrierCountry: string;
  vendorCode: string;
  sellerCompanyName: string;
  buyerCompanyName: string;
  termsAndConditions: string;
  incotermsCode: string;
  incotermsText: string;
  lineNumber: number;
  poLineNumber: number;
  poNumber: string;
  buyerProductCode: string;
  sellerProductCode: string;
  gtin: string;
  productDescription: string;
  despatchedQuantity: number;
  uom: 'Each';
  containerType: string;
  containerQuantity: string;
  containerUom: string;
  containerDescrition: string;
  weight: string;
  weightUom: string;
  weighedDate: Date;
  lineNarrative: string;
}



