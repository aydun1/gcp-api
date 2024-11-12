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

async function sendDocument(data: {key: string, lines: EnvuSale[] | EnvuReceipt[] | EnvuTransfer[]}[], pn_messagetype: 'goodsreceipt' | 'order' | 'transfer'): Promise<any> {
  console.log('Sending data');
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

function groupByProperty(collection: any[]): {key: string, lines: EnvuSale[] | EnvuReceipt[] | EnvuTransfer[]}[] {
  const property = 'trackingId';
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

async function getChemicalTransactions(date: string): Promise<EnvuQuery[]> {
  const request = new sqlRequest();
  const query =
  `
  SELECT
  trx.DOCTYPE,
  RTRIM(trx.ITEMNMBR) AS ITEMNMBR,
  trx.LNSEQNBR,
  RTRIM(hea.BACHNUMB) AS BACHNUMB,
  RTRIM(trx.TRXLOCTN) AS TRXLOCTN,
  RTRIM(REPLACE(trx.TRNSTLOC, 'TRANS', '')) AS TRNSTLOC,
  trx.TRXQTY AS TRXQTY,
  sop.SOPTYPE AS SOPTYPE,
  trx.DOCDATE AS DOCDATE,
  RTRIM(trx.DOCNUMBR) AS DOCNUMBR,
  RTRIM(loc.ADDRESS1) AS ADDRESS1_GCP, RTRIM(loc.ADDRESS2) AS ADDRESS2_GCP, RTRIM(loc.ADDRESS3) AS ADDRESS3_GCP,
  RTRIM(loc.CITY) AS CITY_GCP, RTRIM(loc.STATE) AS STATE_GCP, RTRIM(loc.ZIPCODE) AS ZIPCODE_GCP, RTRIM(loc.COUNTRY) AS COUNTRY_GCP,
  RTRIM(CSTPONBR) AS CSTPONBR,
  RTRIM(soh.CUSTNMBR) AS CUSTNMBR, RTRIM(soh.CUSTNAME) AS CUSTNAME, RTRIM(sop.ADDRESS1) AS ADDRESS1,
  RTRIM(sop.ADDRESS2) AS ADDRESS2, RTRIM(sop.ADDRESS3) AS ADDRESS3, RTRIM(sop.CITY) AS CITY,
  RTRIM(sop.STATE) AS STATE, RTRIM(sop.ZIPCODE) AS ZIPCODE, RTRIM(sop.COUNTRY) AS COUNTRY,
  sop.XTNDPRCE AS XTNDPRCE,
  sop.TAXAMNT AS TAXAMNT,
  sop.QTYFULFI AS QTYFULFI,
  sop.QTYBSUOM AS QTYBSUOM,
  sop.UNITPRCE AS UNITPRCE,
  sop.QUANTITY AS QUANTITY
  FROM [GPLIVE].[GCP].[dbo].[IV30300] trx WITH (NOLOCK)
  LEFT JOIN [IMS].[dbo].Consignments c WITH (NOLOCK)
  ON c.DOCNUMBR = trx.DOCNUMBR AND c.ITEMNMBR = trx.ITEMNMBR AND c.LNSEQNBR = trx.LNSEQNBR
  LEFT JOIN [GPLIVE].[GCP].[dbo].[IV30200] hea WITH (NOLOCK)
  ON hea.IVDOCTYP = trx.DOCTYPE AND hea.DOCNUMBR = trx.DOCNUMBR
  LEFT JOIN [GPLIVE].[GCP].[dbo].[IV40700] loc WITH (NOLOCK)
  ON trx.TRXLOCTN = loc.LOCNCODE
  LEFT JOIN [GPLIVE].[GCP].[dbo].[SOP30300] sop WITH (NOLOCK)
  ON trx.DOCTYPE IN (5, 6) AND trx.DOCNUMBR = sop.SOPNUMBE AND trx.ITEMNMBR = sop.ITEMNMBR AND trx.LNSEQNBR = sop.LNITMSEQ
  LEFT JOIN [GPLIVE].[GCP].[dbo].[SOP30200] soh WITH (NOLOCK)
  ON trx.DOCTYPE IN (5, 6) AND sop.SOPNUMBE = soh.SOPNUMBE AND sop.SOPTYPE = soh.SOPTYPE
  WHERE trx.DOCTYPE IN (2, 3, 5, 6)
  AND trx.ITEMNMBR IN ('${products.map(_ => _.gpCode).filter(_ => _).join('\', \'')}')
  AND trx.TRXLOCTN NOT LIKE '%TRANS'
  AND trx.DOCDATE >= '${date}'
  AND c.SendDate IS NULL
  ORDER BY trx.DOCDATE DESC
  `;
  return request.query<EnvuQuery[]>(query).then(_ => _.recordset);
}

function parseReceiving(result: EnvuQuery[]): EnvuReceipt[] {
  return result.map((r, i, a) => {
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
  return result.map((r, i, a) => {
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
      poNumber: r.DOCNUMBR, // r.CSTPONBR,
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
  return result.map((r, i, a) => {
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

async function newSaveToDb(result: EnvuQuery[]): Promise<any> {
  console.log('Saving data');
  const v = result.map(l => `('Envu',${l.DOCTYPE},'${l.DOCNUMBR}','${l.DOCDATE.toISOString().slice(0, 19).replace('T', ' ')}','${new Date().toISOString().slice(0, 19).replace('T', ' ')}','${l.ITEMNMBR}',${l.LNSEQNBR},${l.TRXQTY},'${l.TRXLOCTN}',${l.QTYFULFI * l.QTYBSUOM})`);
  const insertQuery = `
  INSERT INTO [IMS].[dbo].Consignments (Vendor,DOCTYPE,DOCNUMBR,OrderDate,SendDate,ITEMNMBR,LNSEQNBR,TRXQTY,TRXLOCTN,QUANTITY)
  VALUES ${v.join(',\n')};
  `;
  return v.length > 0 ? await new sqlRequest().query(insertQuery).then(() => console.log('Data saved')) : '';
}

export async function sendChemicalSalesToEnvu() {
  console.log('Starting envu sales update');
  await getAccessToken();
  const shouldSend = true;
  const date = '2024-06-28';
  const queryRes = await getChemicalTransactions(date);
  const docTypes = ([
    ['order', [5, 6]],
    ['transfer', [3]],
    //['goodsreceipt', [2]]
  ] as Array<['goodsreceipt' | 'order' | 'transfer', number[]]>);

  return docTypes.reduce(async (acc, cur) => {
    const lines = queryRes.filter(l => cur[1].includes(l.DOCTYPE));
    const parsedLines = cur[0] === 'order' ? parseOrders(lines) : cur[0] === 'transfer' ? parseTransfers(lines) : parseReceiving(lines);
    const grouped = groupByProperty(parsedLines);
    if (shouldSend && grouped.length > 0) await sendDocument(grouped, cur[0]).then(async () => await newSaveToDb(lines));
    acc[cur[0]] = grouped;
    return acc;
  }, {} as {[key:string]: any});
}