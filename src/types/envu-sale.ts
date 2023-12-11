export interface EnvuSale {
  orderDate: Date;
  orderType: 'Standalone Order';
  documentType: 'New' | 'Amendment' | 'Cancellation' | 'Rejection';
  sourcePartnerId: string;
  destinationPartnerId: string;
  documentCreated: Date
  trackingId: string;
  revisionNumber: string;
  poNumber: string;
  requestedDeliveryDate: Date | string;
  requestedDespatchDate: Date | string;
  buyerCompanyName: string;
  sellerCompanyName: string;
  vendorCode: string;
  soldToCode: string;
  soldToName: string;
  soldToAddress1?: string;
  soldToAddress2?: string;
  soldToAddress3?: string;
  soldToSuburb?: string;
  soldToState?: string;
  soldToPostcode?: string;
  soldToCountry?: string;
  soldToContactName?: string;
  soldToContactPhone?: string;
  soldToContactEmail?: string;
  shipToName: string;
  shipToCode?: string;
  shipToAddress1: string;
  shipToAddress2?: string;
  shipToAddress3?: string;
  shipToPostcode: string;
  shipToSuburb: string;
  shipToState: string;
  shipToCountry: string;
  shipToContactName?: string;
  shipToContactPhone?: string;
  languageCode?: string;
  deliveryType?: string;
  carrierCode?: string;
  carrierName?: string;
  carrierAddress1?: string;
  carrierAddress2?: string;
  carrierAddress3?: string;
  carrierPostcode?: string;
  carrierSuburb?: string;
  carrierState?: string;
  carrierCountry?: string;
  adjustmentCategory?: string;
  adjustmentCode?: string;
  adjustmentDescription?: string;
  adjustmentAmount?: number;
  adjustmentTax?: number;
  adjustmentGross?: number;
  totalNet: number;
  totalTax: number;
  totalLines?: number;
  totalQuantity?: number;
  totalGross: number;
  totalLineValueAdjustments?: number;
  // contractNumber?: string;

  // Lines
  lineNumber: number;
  lineStatus: 'New' | 'Amended' | 'Cancelled' | 'Confirmed' | 'Rejected';
  // requestedDeliveryDate?: Date;
  // requestedDespatchDate?: Date;
  sellerProductCode: string;
  productDescription: string;
  orderQuantity: number;
  uom: 'Each';
  unitPrice: number;
  taxRate: number;
  lineAdjustmentType?: 'Addition' | 'Deduction';
  lineAdjustmentCategory?: 'Transport' | 'Rebate' | 'Discount' | 'Quality' | 'Rounding' | 'Premium' | 'Packaging' | 'Correction' | 'Settlement';
  lineAdjustmentCode?: string;
  lineAdjustmentAmount?: number;
  lineAdjustmentTax?: number;
  lineAdjustmentDescription?: string;
  lineNet: number;
  lineTax: number;
  lineGross: number;
  contractNumber?: string;
  contractItemNumber?: string;
  promoNumber?: string;
  sellerWarehouseCode?: string;
  currency: 'AUD';
}



