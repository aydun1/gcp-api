import { Request as sqlRequest, IResult } from 'mssql';
import axios from 'axios';

import { EnvuSale } from '../types/envu-sale';
import { EnvuReceipt } from '../types/envu-receipt';
import { EnvuQuery } from '../types/envu-query';
import { EnvuTransfer } from '../types/envu-transfer';

interface AuthRes {
  access_token: string;
  scope: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

let authRes!: AuthRes;
let authDate!: Date;

const locations = [
  {envuCode: 'AUC-GCP001', gpCode: 'NSW'},
  {envuCode: 'AUC-GCP002', gpCode: 'MAIN'},
  {envuCode: 'AUC-GCP003', gpCode: 'SA'},
  {envuCode: 'AUC-GCP004', gpCode: 'QLD'},
  {envuCode: 'AUC-GCP005', gpCode: 'WA'}
];

const products = [
  {envuCode: '84504815', gpCode: 'BANOL1', name: 'BANOL (SL) SL722 12X1L BOT AU'},
  {envuCode: '84487031', gpCode: 'DEDIC1', name: 'DEDICATE (SL) SC300 12X1L BOT AU'},
  {envuCode: '87291316', gpCode: 'NA', name: 'DEDICATE FORTE STRSGRD SC240 4X1L BOT AU'},
  {envuCode: '79636954', gpCode: 'DESTINY250', name: 'DESTINY WG10 20X(5X50GR) BAG AU'},
  {envuCode: '86282178', gpCode: 'NA', name: 'ESPLANADE SC500 4X1L BOT AU'},
  {envuCode: '87284603', gpCode: 'NA', name: 'ESPLANADE SC500 4X5L BOT AU'},
  {envuCode: '85767097', gpCode: 'NA', name: 'EXTERIS STRESSGARD TURF SC25 4X5L BOT AU'},
  {envuCode: '86720930', gpCode: 'NA', name: 'INDEMNIFY TURF NEMT SC400 4X500ML BOT AU'},
  {envuCode: '84427624', gpCode: 'NA', name: 'INTERFACE STRESSGARD (SL) 4X5L BOT AU'},
  {envuCode: '84984671', gpCode: 'NA', name: 'RESERVE FUNGICIDE SC720 2X10L BOT AU'},
  {envuCode: '85785265', gpCode: 'NA', name: 'SIGNATURE XTRA STGD WG60 4X2.75KG BOT AU'},
  {envuCode: '84937770', gpCode: 'SPEAR10', name: 'SPEARHEAD (SL) SC398,4 2X10L BOT AU'},
  {envuCode: '88406214', gpCode: 'SPECTICLE250', name: 'SC200 12X250ML BOT AU'},
  {envuCode: '86711990', gpCode: 'SPECTICLE1', name: 'SPECTICLE SC200 4X1L BOT AU'},
  {envuCode: '84474347', gpCode: 'NA', name: 'TEMPO XTRA (SL) SC75 4X5L BOT AU'},
  {envuCode: '87354520', gpCode: 'NA', name: 'TETRINO SC42.8 4X3L BOT AU'},
  {envuCode: '80204353', gpCode: 'TRIBUTE1', name: 'TRIBUTE OD22,5 12X1L BOT AU'}
];

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
    const client_id = 'HJvrEjhzk0NvlNEW2EUVffGslaYt7ljK';
    const client_secret = 'JjGIXHXl4TiRIMzsLVDmx3HG_OnuDsVqpr_SGCkSwiud27AJBTFzyq8sPRf_23xm';
    const grant_type = 'client_credentials'
    const auth_endpoint = 'https://auth0-proxy-oat.apac.proagrica.com/auth/token/apigateway';
    const headers = {'Content-Type': 'application/json'};
    const body = {client_id, client_secret, grant_type};
    const res = await axios.post<AuthRes>(auth_endpoint, body, {headers});
    if (res.status !== 200 || res.data.error) throw new Error(res.data.error_description);
    authDate = new Date();
    authRes = res.data;
    console.log('Auth token gotten')
    return;
  } catch (error: any) {
    throw new Error(error['code'] || error as string);
  }
}

async function sendDocument(data: EnvuReceipt[] | EnvuSale[] | EnvuTransfer[], pn_messagetype: 'goodsreceipt' | 'order' | 'transfer') {
  console.log('Sending data')
  const pn_source = 'gcp';
  const Authorization = authRes.access_token;
  const send_endpoint = 'https://apigateway-oat.apac.proagrica.com/oauth/network/sendDocument';
  const headers = {'Content-Type': 'application/json', pn_source, pn_messagetype, Authorization: `Bearer ${Authorization}`};
  try {
    const res = await axios.post<AuthRes>(send_endpoint, data, {headers});
    console.log('Data sent 👌')
    return res.data;
  } catch (error: any) {
    console.log('Error sending data:', error.response.status)
    return {};
  }
}

function groupByProperty(collection: any[], property: string): {key: string, lines: any[]}[] {
  if(!collection || collection.length === 0) return [{key: 'undefined', lines: []}];
  const groupedCollection = collection.reduce((previous, current)=> {
    if(!previous[current[property]]) {
      previous[current[property]] = [current];
    } else {
      previous[current[property]].push(current);
    }
    return previous;
  }, {});
  return Object.keys(groupedCollection).map(key => ({ key, lines: groupedCollection[key] })).sort((a, b) =>
    a.key === '' ? 1 : b.key === '' ? -1 : a.key.localeCompare(b.key)
  );
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
  FROM SOP30200 sh
  INNER JOIN SOP30300 sd
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

export async function sendChemicalSalesToEnvu() {
  console.log('Starting envu sales update')
  await getAccessToken();
  const chemicals = await getChemicalTransactions();
  const order = groupByProperty([chemicals.sales[0], chemicals.sales[1], chemicals.sales[2]], 'trackingId');
  const goodsreceipt = [chemicals.receiving[0], chemicals.receiving[1], chemicals.receiving[2]];
  const transfers = groupByProperty([chemicals.transfers[0], chemicals.transfers[1], chemicals.transfers[2]], 'trackingId');
  //sendDocument(order, 'order')
  //sendDocument(goodsreceipt, 'goodsreceipt')
  //sendDocument(transfers, 'transfer')
  return {order, goodsreceipt, transfers};
}

export async function getChemicalTransactions(): Promise<{transfers: EnvuTransfer[], receiving: EnvuReceipt[], sales: EnvuSale[]}> {
  const request = new sqlRequest();
  const query =
  `
  SELECT
  trx.DOCTYPE,
  RTRIM(trx.ITEMNMBR) AS ITEMNMBR,
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
  FROM IV30300 trx
  LEFT JOIN IV30301 rct
  ON trx.DOCTYPE = rct.DOCTYPE AND trx.DOCNUMBR = rct.DOCNUMBR AND trx.LNSEQNBR = rct.LNSEQNBR
  LEFT JOIN IV40700 loc
  ON trx.TRXLOCTN = loc.LOCNCODE
  LEFT JOIN SOP30300 sop
  ON trx.DOCTYPE IN (5, 6) AND trx.DOCNUMBR = sop.SOPNUMBE AND trx.ITEMNMBR = sop.ITEMNMBR AND trx.LNSEQNBR = sop.LNITMSEQ
  LEFT JOIN SOP30200 soh
  ON trx.DOCTYPE IN (5, 6) AND sop.SOPNUMBE = soh.SOPNUMBE AND sop.SOPTYPE = soh.SOPTYPE
  WHERE trx.DOCTYPE IN (2, 3, 5, 6)
  AND trx.ITEMNMBR IN ('${products.map(_ => _.gpCode).filter(_ => _).join('\', \'')}')
  AND TRXLOCTN NOT LIKE '%TRANS'
  ORDER BY DOCDATE DESC
  `;


  return await request.query(query).then((_: IResult<EnvuQuery[]>) => {

    // Receiving
    const receiving = _.recordset.filter(_ => [2].includes(_.DOCTYPE)).map((r, i, a) => {
      const documentIdField = 'DOCNUMBR';
      const sopLines = a.filter(_ => r[documentIdField] === _[documentIdField]);
      return {
        shipmentNoteNumber: new Date(r.DOCDATE),
        shipmentNoteDate: r.DOCNUMBR,
        docCreated: new Date(r.DOCDATE),
        docTrackingId: r.DOCNUMBR,
        docRevisionNumber: 1,
        expectedDeliveryDate: new Date(r.DOCDATE),
        dateDispatched: new Date(r.DOCDATE),
        soldToCode: locations.find(_ => _.gpCode === r['TRXLOCTN'])?.envuCode || '',
        sellerCompanyName: 'Envu',
        buyerCompanyName: 'Garden City Plastics',
        // Line item detail
        lineNumber: a.slice(0, i + 1).filter(_ => r[documentIdField] === _[documentIdField]).length,
        destinationPartnerId: locations.find(_ => _.gpCode === r['TRXLOCTN'])?.envuCode || '',
        sellerProductCode: products.find(_ => _.gpCode === r['ITEMNMBR'])?.envuCode || '',
        productDescription: products.find(_ => _.gpCode === r['ITEMNMBR'])?.name || '',
        dispatchedQuantity: r.TRXQTY,
        uom: 'Each'
      } as unknown as EnvuReceipt;
    });

    // Transfers
    const transfers = _.recordset.filter(_ => [3].includes(_.DOCTYPE)).map((r, i, a) => {
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
        requestedDeliveryDate: dateString(),
        requestedDispatchDate: dateString(),
        buyerCompanyName: 'Garden City Plastics',
        sellerCompanyName: 'Garden City Plastics',
        vendorCode: locations.find(_ => _.gpCode === r['TRXLOCTN'])?.envuCode || '',
        soldToCode: locations.find(_ => _.gpCode === r['TRNSTLOC'])?.envuCode || '' + r['TRNSTLOC'],
        totalLines: sopLines.length,
        totalQuantity: sopLines.reduce((a, b) => a += r.TRXQTY, 0),
        // Line
        lineNumber: a.slice(0, i + 1).filter(_ => r[docIdField] === _[docIdField]).length,
        lineStatus: 'New',
        sellerProductCode: products.find(_ => _.gpCode === r['ITEMNMBR'])?.envuCode || '',
        productDescription: products.find(_ => _.gpCode === r['ITEMNMBR'])?.name || '',
        orderQuantity: r.TRXQTY,
        uom: 'Each'
      } as EnvuTransfer;
    });

    // Sold
    const sales = _.recordset.filter(_ => [5, 6].includes(_.DOCTYPE)).map((r, i, a) => {
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
        totalQuantity: sopLines.reduce((a, b) => a += r.DOCTYPE === 6 ? r.QTYFULFI * r.QTYBSUOM : r.QUANTITY * r.QTYBSUOM * -1, 0),
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
    
    return {transfers, receiving, sales}
  });
}
