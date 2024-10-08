import { Request as sqlRequest, IResult } from 'mssql';
import { EnvuSale } from './types/envu-sale';
import { locations, products } from './definitions';

function dateString(): string {
  return '';
}

export function getChemicalSales(): Promise<{lines: EnvuSale[]}> {
  const request = new sqlRequest();
  const query =
  `
  SELECT sh.DOCDATE AS orderDate,
  'Standalone Order' AS orderType,
  'New' AS documentType,
  '' AS sourcePartnerId,
  '' AS destinationPartnerId,

  sh.DOCDATE AS documentCreated,
  RTRIM(sh.SOPNUMBE) AS trackingId,
  '1' AS revisionNumber,
  RTRIM(CSTPONBR) AS poNumber,
  '' AS requestedDeliveryDate,
  '' AS requestedDispatchDate,
  '' AS buyerCompanyName,
  'Garden City Plastics' AS sellerCompanyName,
  RTRIM(sd.LOCNCODE) AS vendorCode,
  RTRIM(sh.CUSTNMBR) AS soldToCode,
  RTRIM(sh.CUSTNAME) AS soldToName,
  RTRIM(sd.ADDRESS1) AS soldToAddress1,
  RTRIM(sd.ADDRESS2) AS soldToAddress2,
  RTRIM(sd.ADDRESS3) AS soldToAddress3,
  RTRIM(sd.CITY) AS soldToSuburb,
  RTRIM(sd.STATE) AS soldToState,
  RTRIM(sd.ZIPCODE) AS soldToPostcode,
  0 as totalNet,
  0 as totalTax,
  0 as totalLines,
  0 as totalQuantity,
  0 as totalGross,
  -- Lines
  RTRIM(sd.ITEMNMBR) AS sellerProductCode,
  RTRIM(sd.ITEMNMBR) AS productDescription,
  0 AS lineNumber,
  'New' as lineStatus,
  CASE sd.SOPTYPE WHEN 3 THEN sd.QTYFULFI*sd.QTYBSUOM WHEN 4 THEN sd.QUANTITY*sd.QTYBSUOM*-1 END AS orderQuantity,
  'Each' as uom,
  sd.UNITPRCE AS unitPrice,
  0.10 AS taxRate,
  sd.XTNDPRCE AS lineNet,
  sd.TAXAMNT AS lineTax,
  sd.XTNDPRCE + sd.TAXAMNT AS lineGross,
  'AUD' as currency
  FROM [GPLIVE].[GCP].[dbo].[SOP30200] sh
  INNER JOIN [GPLIVE].[GCP].[dbo].[SOP30300] sd
  ON sd.SOPNUMBE = sh.SOPNUMBE
  AND sd.SOPTYPE = sh.SOPTYPE
  WHERE sh.VOIDSTTS = 0
  AND sh.SOPTYPE in (3,4)
  AND sd.ITEMNMBR IN ('${products.map(_ => _.gpCode).filter(_ => _).join('\', \'')}')
  AND DOCDATE > '2023-11-01T00:00:00.000Z'
  ORDER BY sh.SOPNUMBE DESC
  `;

  return request.query(query).then((_: IResult<EnvuSale[]>) => {
    const docIdField = 'trackingId';
    _.recordset.forEach((r, i, a) => {
      const sopLines = a.filter(_ => r[docIdField] === _[docIdField]);
      r['totalTax'] = sopLines.reduce((a, b) => a += b.lineTax, 0);
      r['totalNet'] = sopLines.reduce((a, b) => a += b.lineNet, 0);
      r['totalLines'] = sopLines.length;
      r['totalQuantity'] = sopLines.reduce((a, b) => a += b.orderQuantity, 0);
      r['totalGross'] = sopLines.reduce((a, b) => a += b.lineGross, 0);
      r['lineNumber'] = a.slice(0, i + 1).filter(_ => r[docIdField] === _[docIdField]).length;
      r['vendorCode'] = locations.find(_ => _.gpCode === r['vendorCode'])?.envuCode || '';
      r['sellerProductCode'] = products.find(_ => _.gpCode === r['sellerProductCode'])?.envuCode || '';
      r['productDescription'] = products.find(_ => _.gpCode === r['productDescription'])?.name || '';
      r['requestedDeliveryDate'] = dateString();
      r['requestedDispatchDate'] = dateString();
      r['soldToName'] = '';
      r['soldToAddress1'] = '';
      r['soldToAddress2'] = '';
      r['soldToAddress3'] = '';
    });
    return {lines: _.recordset}
  });
}