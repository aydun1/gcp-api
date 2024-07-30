import { Request as sqlRequest } from 'mssql';
import axios from 'axios';

import { EnvuAuth } from '../types/envu-auth';
import { EnvuSale } from '../types/envu-sale';
import { EnvuReceipt } from '../types/envu-receipt';
import { EnvuQuery } from '../types/envu-query';
import { EnvuTransfer } from '../types/envu-transfer';
import { envuConfig } from '../config';
import { locations, products } from '../definitions';

let authRes!: EnvuAuth;
let authDate!: Date;

function dateString(): string {
  const date = new Date();
  return date.getFullYear() * 1e4 + (date.getMonth() + 1) * 100 + date.getDate() + '';
}

async function getAccessToken(): Promise<void> {
  console.log('Getting auth token')
  const now = new Date();
  const expires = authRes ? new Date(authDate.getTime() + authRes.expires_in * 1000) : 0;
  if (now < expires) {
    console.log('Already authenticated')
    return Promise.resolve()
  };
  try {
    const grant_type = 'client_credentials'
    const headers = {'Content-Type': 'application/json'};
    const body = {client_id: envuConfig.clientId, client_secret: envuConfig.clientSecret, grant_type};
    const res = await axios.post<EnvuAuth>(envuConfig.authEndpoint, body, {headers});
    if (res.status !== 200 || res.data.error) throw new Error(res.data.error_description);
    authDate = new Date();
    authRes = res.data;
    console.log('Auth token gotten')
    return;
  } catch (error: any) {
    throw new Error(error['code'] || error as string);
  }
}

async function sendDocument(data: {key: string, lines: EnvuSale[] | EnvuReceipt[] | EnvuTransfer[]}[], pn_messagetype: 'goodsreceipt' | 'order' | 'transfer') {
  console.log('Sending data')
  const pn_source = 'gcp';
  const Authorization = authRes.access_token;
  const headers = {'Content-Type': 'application/json', pn_source, pn_messagetype, Authorization: `Bearer ${Authorization}`};
  try {
    const res = await axios.post<EnvuAuth>(envuConfig.sendEndpoint, data, {headers});
    console.log(`Data sent: ${data.length} ${pn_messagetype}s  👌`)
    return res.data;
  } catch (error: any) {
    console.log('Error sending data:', error.response.status)
    return {};
  }
}

function groupByProperty(collection: any[], property: string): {key: string, lines: EnvuSale[] | EnvuReceipt[] | EnvuTransfer[]}[] {
  if(!collection || collection.length === 0) return [];
  const groupedCollection = collection.reduce((previous, current)=> {
    if(!previous[current[property]]) {
      previous[current[property]] = [current];
    } else {
      previous[current[property]].push(current);
    }
    return previous;
  }, {});
  return Object.keys(groupedCollection).map(key => ({ key, lines: groupedCollection[key] })).sort((a, b) => b.lines[0].orderDate - a.lines[0].orderDate);
}

async function getChemicalTransactions(): Promise<EnvuQuery[]> {
  const request = new sqlRequest();
  const query =
  `
  SELECT
  trx.DOCTYPE,
  RTRIM(trx.ITEMNMBR) AS ITEMNMBR,
  RTRIM(hea.BACHNUMB) AS BACHNUMB,
  RTRIM(trx.TRXLOCTN) AS TRXLOCTN,
  RTRIM(REPLACE(trx.TRNSTLOC, 'TRANS', '')) AS TRNSTLOC,
  trx.TRXQTY AS TRXQTY,
  sop.SOPTYPE AS SOPTYPE,
  trx.DOCDATE AS DOCDATE,
  RTRIM(trx.DOCNUMBR) AS DOCNUMBR,
  RTRIM(loc.ADDRESS1) AS ADDRESS1_GCP,
  RTRIM(loc.ADDRESS2) AS ADDRESS2_GCP,
  RTRIM(loc.ADDRESS3) AS ADDRESS3_GCP,
  RTRIM(loc.CITY) AS CITY_GCP,
  RTRIM(loc.STATE) AS STATE_GCP,
  RTRIM(loc.ZIPCODE) AS ZIPCODE_GCP,
  RTRIM(loc.COUNTRY) AS COUNTRY_GCP,
  RTRIM(CSTPONBR) AS CSTPONBR,
  RTRIM(soh.CUSTNMBR) AS CUSTNMBR,
  RTRIM(soh.CUSTNAME) AS CUSTNAME,
  RTRIM(sop.ADDRESS1) AS ADDRESS1,
  RTRIM(sop.ADDRESS2) AS ADDRESS2,
  RTRIM(sop.ADDRESS3) AS ADDRESS3,
  RTRIM(sop.CITY) AS CITY,
  RTRIM(sop.STATE) AS STATE,
  RTRIM(sop.ZIPCODE) AS ZIPCODE,
  RTRIM(sop.COUNTRY) AS COUNTRY,
  sop.XTNDPRCE AS XTNDPRCE,
  sop.TAXAMNT AS TAXAMNT,
  sop.QTYFULFI AS QTYFULFI,
  sop.QTYBSUOM AS QTYBSUOM,
  sop.UNITPRCE AS UNITPRCE,
  sop.QUANTITY AS QUANTITY
  FROM [GPLIVE].[GCP].[dbo].[IV30300] trx WITH (NOLOCK)
  LEFT JOIN [GPLIVE].[GCP].[dbo].[IV30200] hea WITH (NOLOCK)
  on hea.IVDOCTYP = trx.DOCTYPE AND hea.DOCNUMBR = trx.DOCNUMBR
  LEFT JOIN [GPLIVE].[GCP].[dbo].[IV30301] rct WITH (NOLOCK)
  ON trx.DOCTYPE = rct.DOCTYPE AND trx.DOCNUMBR = rct.DOCNUMBR AND trx.LNSEQNBR = rct.LNSEQNBR
  LEFT JOIN [GPLIVE].[GCP].[dbo].[IV40700] loc WITH (NOLOCK)
  ON trx.TRXLOCTN = loc.LOCNCODE
  LEFT JOIN [GPLIVE].[GCP].[dbo].[SOP30300] sop WITH (NOLOCK)
  ON trx.DOCTYPE IN (5, 6) AND trx.DOCNUMBR = sop.SOPNUMBE AND trx.ITEMNMBR = sop.ITEMNMBR AND trx.LNSEQNBR = sop.LNITMSEQ
  LEFT JOIN [GPLIVE].[GCP].[dbo].[SOP30200] soh WITH (NOLOCK)
  ON trx.DOCTYPE IN (5, 6) AND sop.SOPNUMBE = soh.SOPNUMBE AND sop.SOPTYPE = soh.SOPTYPE
  WHERE trx.DOCTYPE IN (2, 3, 5, 6)
  AND trx.ITEMNMBR IN ('${products.map(_ => _.gpCode).filter(_ => _).join('\', \'')}')
  AND TRXLOCTN NOT LIKE '%TRANS'
  AND trx.DOCDATE >= '${'2024-07-11'}'
  ORDER BY trx.DOCDATE DESC
  `;
  return request.query<EnvuQuery[]>(query).then(_ => _.recordset);
}

function parseReceiving(result: EnvuQuery[]): EnvuReceipt[] {
  return result.filter(_ => [2].includes(_.DOCTYPE)).map((r, i, a) => {
    const docIdField = 'DOCNUMBR';
    const sopLines = a.filter(_ => r[docIdField] === _[docIdField]);
    return {
      shipmentNoteNumber: new Date(r.DOCDATE),
      shipmentNoteDate: r.DOCNUMBR,
      documentCreated: new Date(r.DOCDATE),
      trackingId: r.DOCNUMBR,
      revisionNumber: 1,
      poNumber: r.BACHNUMB,
      expectedDeliveryDate: new Date(r.DOCDATE),
      dateDispatched: new Date(r.DOCDATE),
      soldToCode: locations.find(_ => _.gpCode === r['TRXLOCTN'])?.envuCode || '',
      sellerCompanyName: 'Envu',
      buyerCompanyName: 'Garden City Plastics',
      totalLines: sopLines.length,
      totalQuantity: sopLines.reduce((a, b) => a += b.TRXQTY, 0),
      // Line item detail
      lineNumber: a.slice(0, i + 1).filter(_ => r[docIdField] === _[docIdField]).length,
      destinationPartnerId: locations.find(_ => _.gpCode === r['TRXLOCTN'])?.envuCode || '',
      sellerProductCode: products.find(_ => _.gpCode === r['ITEMNMBR'])?.envuCode || '',
      productDescription: products.find(_ => _.gpCode === r['ITEMNMBR'])?.name || '',
      dispatchedQuantity: r.TRXQTY,
      uom: 'Each'
    } as unknown as EnvuReceipt;
  });
}

function parseOrders(result: EnvuQuery[]): EnvuSale[] {
  return result.filter(_ => [5, 6].includes(_.DOCTYPE)).map((r, i, a) => {
    const docIdField = 'DOCNUMBR';
    const sopLines = a.filter(_ => r[docIdField] === _[docIdField]);
    return {
      orderDate: new Date(r.DOCDATE),
      orderType: 'Standalone Order',
      documentType: 'New',
      sourcePartnerId: '',
      destinationPartnerId: '',
      documentCreated: new Date(r.DOCDATE),
      trackingId: r.DOCNUMBR,
      revisionNumber: '1',
      poNumber: '', // r.CSTPONBR,
      requestedDeliveryDate: dateString(),
      requestedDispatchDate: dateString(),
      buyerCompanyName: '',
      sellerCompanyName: 'Garden City Plastics',
      vendorCode: locations.find(_ => _.gpCode === r['TRXLOCTN'])?.envuCode || '',
      soldToCode: r.CUSTNMBR,
      soldToName: '', // r.CUSTNAME,
      soldToSuburb: '', // r.CITY,
      soldToState: '', // r.STATE,
      soldToPostcode: '', // r.ZIPCODE,
      soldToCountry: '', // 'Australia',
      shipToName: '',
      shipToCode: '',
      shipToAddress1: '',
      shipToPostcode: '',
      shipToSuburb: '',
      shipToState: '',
      shipToCountry: '',
      totalNet: sopLines.reduce((a, b) => a += b.XTNDPRCE, 0),
      totalTax: sopLines.reduce((a, b) => a += b.TAXAMNT, 0),
      totalLines: sopLines.length,
      totalQuantity: sopLines.reduce((a, b) => a += b.DOCTYPE === 6 ? b.QTYFULFI * b.QTYBSUOM : b.QUANTITY * b.QTYBSUOM * -1, 0),
      totalGross: sopLines.reduce((a, b) => a += b.XTNDPRCE + b.TAXAMNT, 0),
      // Line
      lineNumber: a.slice(0, i + 1).filter(_ => r[docIdField] === _[docIdField]).length,
      lineStatus: 'New',
      sellerProductCode: products.find(_ => _.gpCode === r['ITEMNMBR'])?.envuCode || '',
      productDescription: products.find(_ => _.gpCode === r['ITEMNMBR'])?.name || '',
      orderQuantity: r.DOCTYPE === 6 ? r.QTYFULFI * r.QTYBSUOM : r.QUANTITY * r.QTYBSUOM * -1,
      uom: 'Each',
      unitPrice: r.UNITPRCE,
      taxRate: 0.10,
      lineNet: r.XTNDPRCE,
      lineTax: r.TAXAMNT,
      lineGross: r.XTNDPRCE + r.TAXAMNT,
      currency: 'AUD'
    } as EnvuSale;
  });
}

function parseTransfers(result: EnvuQuery[]): EnvuTransfer[] {
  return result.filter(_ => [3].includes(_.DOCTYPE)).map((r, i, a) => {
    const docIdField = 'DOCNUMBR';
    const sopLines = a.filter(_ => r[docIdField] === _[docIdField]);
    const transferFrom = locations.find(_ => _.gpCode === r['TRXLOCTN']);
    const transferTo = locations.find(_ => _.gpCode === r['TRNSTLOC']);
    return {
      orderDate: new Date(r.DOCDATE),
      orderType: 'Standalone Order',
      documentType: 'New',
      sourcePartnerId: '',
      destinationPartnerId: '',
      documentCreated: new Date(r.DOCDATE),
      trackingId: r.DOCNUMBR,
      revisionNumber: '1',
      poNumber: r.DOCNUMBR,
      requestedDeliveryDate: dateString(),
      requestedDispatchDate: dateString(),
      buyerCompanyName: 'Garden City Plastics',
      sellerCompanyName: 'Garden City Plastics',
      vendorCode: transferFrom?.envuCode || '',
      soldToCode: transferTo?.envuCode || '' + r['TRNSTLOC'],
      shipToAddress1: transferTo?.address1,
      shipToPostcode: transferTo?.postcode,
      shipToSuburb: transferTo?.city,
      shipToState: transferTo?.state,
      shipToCountry: transferTo?.countryCode,
      totalLines: sopLines.length,
      totalQuantity: sopLines.reduce((a, b) => a += b.TRXQTY, 0),
      // Line
      lineNumber: a.slice(0, i + 1).filter(_ => r[docIdField] === _[docIdField]).length,
      lineStatus: 'New',
      sellerProductCode: products.find(_ => _.gpCode === r['ITEMNMBR'])?.envuCode || '',
      productDescription: products.find(_ => _.gpCode === r['ITEMNMBR'])?.name || '',
      orderQuantity: r.TRXQTY,
      uom: 'Each'
    } as EnvuTransfer;
  });
}

export async function sendChemicalSalesToEnvu() {
  console.log('Starting envu sales update');
  const shouldSend = true;
  await getAccessToken();
  const queryRes = await getChemicalTransactions();
  const orders = groupByProperty(parseOrders(queryRes), 'trackingId');
  const transfers = groupByProperty(parseTransfers(queryRes), 'trackingId');
  const goodsReceipts = groupByProperty(parseReceiving(queryRes), 'trackingId');
  if (shouldSend && orders.length > 0) await sendDocument(orders, 'order');
  if (shouldSend && transfers.length > 0) await sendDocument(transfers, 'transfer');
  //if (shouldSend && goodsReceipts.length > 0) await sendDocument(goodsReceipts, 'goodsreceipt');
  return { orders, transfers};
}