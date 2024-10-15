import { TYPES, Request as sqlRequest, IResult, IRecordSet, MAX, IProcedureResult } from 'mssql';
import fs from 'fs';

import { allowedPallets, targetDir } from '../config';
import { Delivery } from '../types/delivery';
import { Line } from '../types/line';
import { InTransitTransferLine } from '../types/in-transit-transfer-line';
import { InTransitTransfer } from '../types/in-transit-transfer';
import { CwFolder } from '../types/CwFolder';
import { CwRow } from '../types/CwRow';
import { Order } from '../types/order';

import { getChemwatchSds, initChemwatch } from './cw.service';

const palletStoredProcedure = '[GPLIVE].[GCP].[dbo].[usp_PalletUpdate]';
const productionStoredProcedure = '[GPLIVE].[GCP].[dbo].[usp_ProductionReport]';

const dct: {[key: string]: {uom: string, divisor: number}} = {
  millilitre: {divisor: 1000, uom: 'L'},
  milliliter: {divisor: 1000, uom: 'L'},
  ml: {divisor: 1000, uom: 'L'},
  litre: {divisor: 1, uom: 'L'},
  liter: {divisor: 1, uom: 'L'},
  ltr: {divisor: 1, uom: 'L'},
  l: {divisor: 1, uom: 'L'},
  kilogram: {divisor: 1, uom: 'kg'},
  kg: {divisor: 1, uom: 'kg'},
  gram: {divisor: 1000, uom: 'kg'},
  g: {divisor: 1000, uom: 'kg'}
};
const fileExists = (path: string) => fs.promises.stat(path).then(() => true, () => false);
const sizeRegexp = new RegExp(`([0-9.,]+)\\s*(${Object.keys(dct).join('|')})\\b`);
const ignoreRegexp = /2g|4g|5g|80g|g\/l|g\/kg/;
const cartonRegexp = /\[ctn([0-9]+)\]/;
const driverNoteRegexp = /\*([a-zA-Z0-9\s,./\\!@#$%^&()\-=]+)\*/g;
const cwFolderId = '4006663';

interface gpRes {
  recordset: Array<object>;
  output: object;
  rowsAffected: Array<number>;
  returnValue: number;
}

function createIttId(branch: string): Promise<string> {
  const request = new sqlRequest();
  const branchLetter = branch[0].toLocaleUpperCase();
  const prefix = `ITT[${branchLetter}]`;
  const ittLookup = `${prefix}0%`;
  const query =
  `
  SELECT TOP(1) * FROM (
    SELECT ORDDOCID FROM [GPLIVE].[GCP].[dbo].[SVC00700] WHERE ORDDOCID LIKE @lookup
    UNION
    SELECT ORDDOCID FROM [GPLIVE].[GCP].[dbo].[SVC30700] WHERE ORDDOCID LIKE @lookup
  ) u
  ORDER BY ORDDOCID DESC
  `;
  return request.input('lookup', TYPES.VarChar(15), ittLookup).query(query).then((_: IResult<{ORDDOCID: string}>) =>  {
    const match = _.recordset[0] ? parseInt(_.recordset[0].ORDDOCID.slice(4)) : 0;
    const nextSuffix = String(match + 1).padStart(5, '0');
    return `ITT${branchLetter}${nextSuffix}`;
  });
}

function parseBranch(branch: string): string {
  return branch === 'VIC' ? 'MAIN' : branch.substring(0, 4);
}

function getNextDay(): Date {
  const date = new Date();
  const day = date.getDay();
  const nextDay = day > 4 ? 8 - day : 1;
  date.setDate(date.getDate() + nextDay);
  date.setHours(0,0,0,0);
  return date;
}

export function getInTransitTransfer(id: string): Promise<InTransitTransfer> {
  const request = new sqlRequest();
  const query =
  `
  SELECT rtrim(ORDDOCID) docId,
         ORDRDATE orderDate,
         ETADTE EtaDate,
         rtrim(TRNSFLOC) fromSite,
         rtrim(LOCNCODE) toSite
  FROM [GPLIVE].[GCP].[dbo].[SVC00700] WITH (NOLOCK)
  WHERE ORDDOCID = @doc_id
  `;
  return request.input('doc_id', TYPES.VarChar(15), id).query(query).then((_: IResult<InTransitTransfer>) =>  {return _.recordset[0]});
}

export async function updateAttachmentCount(sopNumber: string, attachments: number, increment: false): Promise<any> {
  const getQuery = 'SELECT OrderNumber FROM [IMS].[dbo].[Deliveries] WHERE OrderNumber = @sopNumber';
  const currentCount = await new sqlRequest().input('sopNumber', TYPES.Char(21), sopNumber).query(getQuery).then((_: IResult<gpRes>) => _.recordset.length);
  if (currentCount === 0) return 'No delivery to update';
  const updateQuery = `UPDATE [IMS].[dbo].[Deliveries] SET Attachments = ${increment ? 'Attachments +' : ''} @attachments WHERE OrderNumber = @sopNumber`;
  await new sqlRequest().input('sopNumber', TYPES.VarChar(21), sopNumber).input('attachments', TYPES.Int, attachments).query(updateQuery);
  return 'Updated';
}

export function getInTransitTransfers(id: string, from: string, to: string): Promise<{lines: InTransitTransferLine[]}> {
  from = parseBranch(from);
  to = parseBranch(to);
  const request = new sqlRequest();
  let query =
  `
  SELECT rtrim(a.ORDDOCID) DocId,
         rtrim(b.ITEMNMBR) ItemNmbr,
         rtrim(c.ITEMDESC) ItemDesc,
         rtrim(e.BIN) Bin,
         b.TRNSFQTY TransferQty,
         b.QTYFULFI QtyFulfilled,
         b.QTYSHPPD QtyShipped,
         b.TRNSFQTY - b.QTYSHPPD QtyRemaining,
         a.ORDRDATE OrderDate,
         a.ETADTE EtaDate,
         rtrim(b.TRNSFLOC) FromSite,
         rtrim(b.TRNSTLOC) ToSite,
         b.LNITMSEQ,
         b.DEX_ROW_ID Id,
         d.QTYONHND QtyOnHand,
         d.QTYONHND - d.ATYALLOC QtyAvailable,
         b.UOFM UOFM
  FROM [GPLIVE].[GCP].[dbo].[SVC00700] a WITH (NOLOCK)
  INNER JOIN [GPLIVE].[GCP].[dbo].[SVC00701] b WITH (NOLOCK)
  ON a.ORDDOCID = b.ORDDOCID
  INNER JOIN [GPLIVE].[GCP].[dbo].[IV00101] c WITH (NOLOCK)
  ON b.ITEMNMBR = c.ITEMNMBR
  LEFT JOIN [GPLIVE].[GCP].[dbo].[IV00102] d WITH (NOLOCK)
  ON b.ITEMNMBR = d.ITEMNMBR AND b.TRNSFLOC = d.LOCNCODE
  LEFT JOIN (SELECT * FROM [GPLIVE].[GCP].[dbo].[IV00117] WITH (NOLOCK) WHERE PRIORITY = 1) e
  ON b.ITEMNMBR = e.ITEMNMBR AND b.TRNSFLOC = e.LOCNCODE
  WHERE b.TRNSFQTY > 0
  AND b.TRNSFQTY - b.QTYSHPPD > 0
  `;
  if (id) query += ' AND a.ORDDOCID = @doc_id';
  if (from) query += ' AND b.TRNSFLOC = @from_state';
  if (to) query += ' AND b.TRNSTLOC = @to_state';
  query +=' ORDER BY a.ORDRDATE DESC';
  return request.input('doc_id', TYPES.VarChar(15), id).input('from_state', TYPES.VarChar(15), from).input('to_state', TYPES.VarChar(15), to).query(query).then((_: IResult<InTransitTransferLine>) =>  {return {lines: _.recordset}});
}

export function getPurchaseOrderNumbers(from: string, to: string): Promise<{lines: object[]}> {
  from = parseBranch(from);
  to = parseBranch(to);
  const request = new sqlRequest();
  let query =
  `
  SELECT rtrim(a.PONUMBER) PONumber,
         rtrim(b.ITEMNMBR) ItemNmbr,
         rtrim(c.ITEMDESC) ItemDesc,
         b.QTYORDER - b.QTYCANCE OrderQty,
         b.QTYCANCE CancelledQty,
         b.EXTDCOST ExtdCost,
         a.REQDATE Date,
         rtrim(PURCHSTATE) FromSite,
         rtrim(b.LOCNCODE) ToSite,
         b.LineNumber,
         b.DEX_ROW_ID Id,
         d.QTYONHND QtyOnHand,
         d.QTYONHND - d.ATYALLOC QtyAvailable
  FROM [GPLIVE].[GCP].[dbo].[POP10100] a WITH (NOLOCK)
  INNER JOIN [GPLIVE].[GCP].[dbo].[POP10110] b WITH (NOLOCK)
  ON a.PONUMBER = b.PONUMBER
  INNER JOIN [GPLIVE].[GCP].[dbo].[IV00101] c WITH (NOLOCK)
  ON b.ITEMNMBR = c.ITEMNMBR
  LEFT JOIN [GPLIVE].[GCP].[dbo].[IV00102] d WITH (NOLOCK)
  ON b.ITEMNMBR = d.ITEMNMBR AND d.LOCNCODE = @from_state
  WHERE a.VENDORID in('100241', '164403', '164802', '200001', '200113', '200231', '200387', '300298', '300299', '300310', '300365', '404562', '404631', '404632','404633','404634','502014')
  AND b.QTYCANCE < b.QTYORDER
  AND b.QTYORDER <> 0
  `;
  if (from) query += ' AND a.PURCHSTATE = @from_state';
  if (to) query += ' AND b.LOCNCODE = @to_state';
  query +=' ORDER BY Date DESC';
  return request.input('from_state', TYPES.VarChar(15), from).input('to_state', TYPES.VarChar(15), to).query(query).then((_: IResult<gpRes>) =>  {return {lines: _.recordset}});
}

export function getPurchaseOrder(poNumber: string): Promise<{lines: object[]}> {
  const request = new sqlRequest();
  const query =
  `
  SELECT rtrim(a.ITEMNMBR) ItemNmbr,
  rtrim(b.ITEMDESC) ItemDesc,
  a.QTYORDER OrderQty,
  a.QTYCANCE CancelledQty,
  a.EXTDCOST ExtendedCost
  FROM [GPLIVE].[GCP].[dbo].[POP10110] a WITH (NOLOCK)
  INNER JOIN [GPLIVE].[GCP].[dbo].[IV00101] b WITH (NOLOCK)
  ON a.ITEMNMBR = b.ITEMNMBR
  AND a.PONUMBER = '${poNumber}'
  `;
  return request.query(query).then((_: IResult<gpRes>) => {return {lines: _.recordset}});
}

export function getItems(branch: string, itemNumbers: Array<string>, searchTerm: string) {
  branch = parseBranch(branch);
  const request = new sqlRequest();
  let query = `
  SELECT ${searchTerm ? 'TOP(50)' : ''} a.DEX_ROW_ID Id,
  RTRIM(a.ITEMNMBR) ItemNmbr,
  RTRIM(a.ITEMDESC) ItemDesc,
  RTRIM(u.BASEUOFM) BaseUom,
  p.PalletQty PalletQty,
  p.PalletHeight PalletHeight,
  p.PackQty PackSize,
  p.CustomUom CustomUom,
  RTRIM(b.LOCNCODE) Location,
  --RTRIM(d.BIN) Bin,
  RTRIM(b.PRIMVNDR) Vendor,
  RTRIM(a.USCATVLS_3) Category,
  b.ORDRPNTQTY OrderPointQty,
  b.ORDRUPTOLVL OrderUpToLvl,
  b.MNMMORDRQTY MinOrderQty,
  b.MXMMORDRQTY MaxOrderQty,

  pw.OnHand OnHandVIC,
  e.HEA OnHandHEA,
  e.QLD OnHandQLD,
  e.NSW OnHandNSW,
  e.SA OnHandSA,
  e.WA OnHandWA,

  f.HEA AllocHEA,
  f.QLD AllocQLD,
  f.NSW AllocNSW,
  f.SA AllocSA,
  f.MAIN AllocVIC,
  f.WA AllocWA,

  g.HEA BackorderHEA,
  g.QLD BackorderQLD,
  g.NSW BackorderNSW,
  g.SA BackorderSA,
  g.MAIN BackorderVIC,
  g.WA BackorderWA,

  e.HEA - f.HEA - g.HEA AvailHEA,
  e.QLD - f.QLD - g.QLD AvailQLD,
  e.NSW - f.NSW - g.NSW AvailNSW,
  e.SA - f.SA - g.SA AvailSA,
  e.WA - f.WA - g.WA AvailWA,

  b.QTYONHND QtyOnHand,
  b.QTYBKORD QtyBackordered,
  b.ATYALLOC QtyAllocated,
  COALESCE(m.ATYALLOC, 0) QtyOnOrderAll,
  COALESCE(m.week, 0) QtyOnOrderWeek,
  COALESCE(m.month, 0) QtyOnOrderMonth,
  COALESCE(c.QTYONHND, 0) InTransit,
  COALESCE(h.IttRemaining, 0) PreTransit,
  b.QTYONHND + COALESCE(c.QTYONHND, 0) + COALESCE(h.IttRemaining, 0) - b.ATYALLOC - b.QTYBKORD QtyAvailable
  FROM [GPLIVE].[GCP].[dbo].[IV00101] a WITH (NOLOCK)

  -- Get quantities and shiz
  INNER JOIN [GPLIVE].[GCP].[dbo].[IV00102] b WITH (NOLOCK)
  ON a.ITEMNMBR = b.ITEMNMBR

  -- Get UofM
  LEFT JOIN [GPLIVE].[GCP].[dbo].[IV40201] u WITH (NOLOCK)
  ON a.UOMSCHDL = u.UOMSCHDL

  -- Get specs
  LEFT JOIN (
    SELECT *
    FROM [PERFION].[GCP-Perfion-LIVE].[dbo].[ProductSpecs] WITH (NOLOCK)
    WHERE COALESCE(PalletQty, PackQty, PalletHeight, PackWeight) IS NOT null
  ) p
  ON a.ITEMNMBR = p.Product

  -- get ITTs
  LEFT JOIN (
    SELECT ITEMNMBR, TRNSTLOC, SUM(TRNSFQTY) - SUM(QTYSHPPD) IttRemaining
    FROM [GPLIVE].[GCP].[dbo].[SVC00701] WITH (NOLOCK)
    GROUP BY ITEMNMBR, TRNSTLOC
  ) h
  ON a.ITEMNMBR = h.ITEMNMBR AND b.LOCNCODE = h.TRNSTLOC

  -- Get in transits
  LEFT JOIN (
    SELECT ITEMNMBR,
    REPLACE(LOCNCODE, 'TRANS', '') lcn,
    QTYONHND
    FROM [GPLIVE].[GCP].[dbo].[IV00102] WITH (NOLOCK)
    WHERE LOCNCODE LIKE '%TRANS'
    AND QTYONHND > 0
  ) c
  ON a.ITEMNMBR = c.ITEMNMBR AND b.LOCNCODE = c.lcn

  -- Exclude allocs after specified date
  LEFT JOIN (
    SELECT b.ITEMNMBR,
    b.LOCNCODE,
    SUM(b.ATYALLOC * b.QTYBSUOM) ATYALLOC,
    SUM(CASE WHEN b.ReqShipDate <=  DATEADD(DAY, +7, CONVERT(VARCHAR, GETDATE(), 23)) THEN b.ATYALLOC * b.QTYBSUOM else 0 END) Week,
    SUM(CASE WHEN b.ReqShipDate <=  DATEADD(DAY, +30, CONVERT(VARCHAR, GETDATE(), 23))  THEN b.ATYALLOC * b.QTYBSUOM else 0 END) Month,
    SUM(CASE WHEN b.ReqShipDate <=  DATEADD(DAY, +365, CONVERT(VARCHAR, GETDATE(), 23))  THEN b.ATYALLOC * b.QTYBSUOM else 0 END) Year
    FROM [GPLIVE].[GCP].[dbo].[SOP10100] a WITH (NOLOCK)
    INNER JOIN [GPLIVE].[GCP].[dbo].[SOP10200] b WITH (NOLOCK)
    ON a.SOPNUMBE = b.SOPNUMBE AND a.SOPTYPE = b.SOPTYPE
    WHERE b.SOPTYPE = 2
    GROUP BY b.ITEMNMBR, b.LOCNCODE
  ) m
  ON b.ITEMNMBR = m.ITEMNMBR AND b.LOCNCODE = m.LOCNCODE

  -- Get Vic stock from Paperless
  LEFT JOIN [GPLIVE].[GCP].[dbo].[IMS_Main_Stock] pw
  ON a.ITEMNMBR COLLATE DATABASE_DEFAULT = pw.ITEMNMBR COLLATE DATABASE_DEFAULT

  -- Get bin allocations
  --LEFT JOIN [GPLIVE].[GCP].[dbo].[IV00117] d WITH (NOLOCK)
  --ON a.ITEMNMBR = d.ITEMNMBR AND b.LOCNCODE = d.LOCNCODE

  -- Get branch SOHs
  LEFT JOIN (
    SELECT * FROM (
      SELECT ITEMNMBR, LOCNCODE, QTYONHND
      FROM [GPLIVE].[GCP].[dbo].[IV00102] WITH (NOLOCK)
      WHERE QTYONHND <> 0
    ) a
    PIVOT (
      SUM(QTYONHND)
      FOR LOCNCODE IN (HEA, NSW, QLD, WA, SA)
    ) Pivot_table
  ) e
  ON a.ITEMNMBR = e.ITEMNMBR

  -- Get branch Alloc
  LEFT JOIN (
    SELECT * FROM (
      SELECT ITEMNMBR, LOCNCODE, ATYALLOC
      FROM [GPLIVE].[GCP].[dbo].[IV00102] WITH (NOLOCK)
      WHERE ATYALLOC <> 0
    ) a
    PIVOT (
      SUM(ATYALLOC)
      FOR LOCNCODE IN (HEA, NSW, QLD, WA, SA, MAIN)
    ) Pivot_table
  ) f
  ON a.ITEMNMBR = f.ITEMNMBR

  -- Get branch backorders
  LEFT JOIN (
    SELECT * FROM (SELECT ITEMNMBR, LOCNCODE, QTYBKORD FROM [GPLIVE].[GCP].[dbo].[IV00102] WITH (NOLOCK) WHERE QTYBKORD <> 0) a
    PIVOT (
      SUM(QTYBKORD)
      FOR LOCNCODE IN (HEA, NSW, QLD, WA, SA, MAIN)
    ) Pivot_table
  ) g
  ON a.ITEMNMBR = g.ITEMNMBR

  WHERE b.LOCNCODE = @branch
  `;
  if (itemNumbers && itemNumbers.length > 0) {
    const itemList = itemNumbers.map(_ => `${_}`).join(',');
    request.input('items', TYPES.VarChar, itemList);
    query += ' AND a.ITEMNMBR in (@items)';
  } else if (searchTerm) {
    request.input('item', TYPES.VarChar(32), `${searchTerm}%`);
    query += ' AND a.ITEMNMBR LIKE @item';
  } else {
    query += ` AND (
      b.ATYALLOC + b.QTYBKORD - b.QTYONHND - COALESCE(c.QTYONHND, 0) - COALESCE(h.IttRemaining, 0) + b.MXMMORDRQTY > 0 OR
      b.ATYALLOC + b.QTYBKORD - b.QTYONHND - COALESCE(c.QTYONHND, 0) - COALESCE(h.IttRemaining, 0) + b.ORDRUPTOLVL > 0
    )`
  }
  query += ' ORDER BY a.ITEMNMBR ASC';
  return request.input('branch', TYPES.VarChar(15), branch).query(query).then((_: IResult<gpRes>) => {return {lines: _.recordset}});
}

export function getCustomers(branches: Array<string>, sort: string, orderby: string, filters: Array<string>, search: string, page: number): Promise<{customers: gpRes[]}> {
  const request = new sqlRequest();
  const offset = Math.max(0, (page - 1) * 50);
  const order = sort === 'desc' ? 'DESC' : 'ASC';
  let query =
  `
  SELECT rtrim(a.CUSTNMBR) custNmbr, rtrim(a.CUSTNAME) name, COALESCE(USERDEF2, 0) loscam, COALESCE(USERDEF1, 0) chep, COALESCE(b.plain, 0) plain, COALESCE(c.gcp, 0) gcp
  FROM [GPLIVE].[GCP].[dbo].[RM00101] a WITH (NOLOCK)
  LEFT JOIN (
    SELECT rtrim(ObjectID) CUSTNMBR, TRY_CAST(PropertyValue AS INT) plain
    FROM [GPLIVE].[GCP].[dbo].[SY90000] WITH (NOLOCK)
    WHERE ObjectType = 'Customer'
    AND PropertyName = 'PLAINQty'
    AND PropertyValue != 0
  ) b ON a.CUSTNMBR = b.CUSTNMBR
  LEFT JOIN (
    SELECT rtrim(ObjectID) CUSTNMBR, TRY_CAST(PropertyValue AS INT) gcp
    FROM [GPLIVE].[GCP].[dbo].[SY90000] WITH (NOLOCK)
    WHERE ObjectType = 'Customer'
    AND PropertyName = 'GCPQty'
    AND PropertyValue != 0
  ) c ON a.CUSTNMBR = c.CUSTNMBR
  `;
  const filterConditions = [];
  const palletFilters = [];
  if (branches.length > 0) filterConditions.push(`a.CUSTCLAS in ('${branches.join('\', \'')}')`);
  if (filters.length === 0) filterConditions.push(`a.INACTIVE = 0`);
  if (filters.includes('loscam')) palletFilters.push('USERDEF2 <> 0');
  if (filters.includes('chep')) palletFilters.push('USERDEF1 <> 0');
  if (filters.includes('plain')) palletFilters.push('b.plain <> 0');
  if (filters.includes('gcp')) palletFilters.push('c.gcp <> 0');
  if (search) filterConditions.push(`(a.CUSTNMBR LIKE '${search}%' OR a.CUSTNAME LIKE '%${search}%')`);
  if (palletFilters.length > 0) filterConditions.push(`(${palletFilters.join(' OR ')})`);
  if (filterConditions.length > 0) query += ` WHERE ${filterConditions.join(' AND ')}`;
  query += ` ORDER BY ${orderby.replace('name', 'custName') || 'custName'} ${order}`;
  query += ' OFFSET @offset ROWS FETCH NEXT 50 ROWS ONLY';
  return request.input('offset', TYPES.SmallInt, offset).input('orderby', TYPES.VarChar(15), orderby).query(query).then((_: IResult<gpRes>) => {return {customers: _.recordset}});
}

export function getCustomer(custNmbr: string): Promise<{customer: gpRes}> {
  const request = new sqlRequest();
  const query =
  `
  SELECT rtrim(a.CUSTNMBR) custNmbr, rtrim(a.CUSTNAME) name, rtrim(ADRSCODE) addressCode, rtrim(PRSTADCD) shippingAddressCode, COALESCE(USERDEF2, 0) loscam, COALESCE(USERDEF1, 0) chep, COALESCE(b.plain, 0) plain, COALESCE(c.gcp, 0) gcp
  FROM [GPLIVE].[GCP].[dbo].[RM00101] a WITH (NOLOCK)
  LEFT JOIN (
    SELECT rtrim(ObjectID) CUSTNMBR, TRY_CAST(PropertyValue AS INT) plain
    FROM [GPLIVE].[GCP].[dbo].[SY90000] WITH (NOLOCK)
    WHERE ObjectType = 'Customer'
    AND PropertyName = 'PLAINQty'
    AND PropertyValue != 0
  ) b ON a.CUSTNMBR = b.CUSTNMBR
  LEFT JOIN (
    SELECT rtrim(ObjectID) CUSTNMBR, TRY_CAST(PropertyValue AS INT) gcp
    FROM [GPLIVE].[GCP].[dbo].[SY90000] WITH (NOLOCK)
    WHERE ObjectType = 'Customer'
    AND PropertyName = 'GCPQty'
    AND PropertyValue != 0
  ) c ON a.CUSTNMBR = c.CUSTNMBR
  WHERE a.CUSTNMBR = @custnmbr
  `;
  const custQuery = request.input('custnmbr', TYPES.VarChar(15), custNmbr).query(query) as Promise<IResult<gpRes>>;
  const addrQuery = getCustomerAddresses(custNmbr);
  return Promise.all([custQuery, addrQuery]).then(([c, a]) => {
    return {
      customer: {...c.recordset[0],
        addresses: a.addresses
      }
    }
  });
}

export function getCustomerAddresses(custNmbr: string) {
  const request = new sqlRequest();
  const query =
  `
  SELECT rtrim(ADRSCODE) name, rtrim(CNTCPRSN) contact, rtrim(ADDRESS1) address1, rtrim(ADDRESS2) address2, rtrim(ADDRESS3) address3, rtrim(CITY) city, rtrim(STATE) state, rtrim(ZIP) postcode, RTRIM(PHONE1) phoneNumber1, RTRIM(PHONE2) phoneNumber2
  FROM [GPLIVE].[GCP].[dbo].[RM00102] WITH (NOLOCK)
  WHERE CUSTNMBR = @custnmbr
  ORDER BY ADRSCODE ASC
  `;
  return request.input('custnmbr', TYPES.VarChar(15), custNmbr).query(query).then((_: IResult<gpRes>) => {return {addresses: _.recordset}});
}

export function getVendors(search: string, page: number): Promise<{vendors: gpRes[]}> {
  const request = new sqlRequest();
  const offset = Math.max(0, (page - 1) * 50);
  let query =
  `
  SELECT rtrim(a.VENDORID) vendId, rtrim(a.VENDNAME) name
  FROM [GPLIVE].[GCP].[dbo].[PM00200] a WITH (NOLOCK)
  `;
  const filterConditions = [];
  filterConditions.push(`a.VENDSTTS = 1`);
  if (search) filterConditions.push(`(a.VENDORID LIKE '${search}%' OR a.VENDNAME LIKE '%${search}%')`);
  if (filterConditions.length > 0) query += ` WHERE ${filterConditions.join(' AND ')}`;
  query += ` ORDER BY VENDNAME ASC`;
  query += ' OFFSET @offset ROWS FETCH NEXT 50 ROWS ONLY';
  return request.input('offset', TYPES.SmallInt, offset).query(query).then((_: IResult<gpRes>) => {return {vendors: _.recordset}});
}

export function getVendorAddresses(vendNmbr: string) {
  const request = new sqlRequest();
  const query =
  `
  SELECT rtrim(ADRSCODE) name, rtrim(VNDCNTCT) contact, rtrim(ADDRESS1) address1, rtrim(ADDRESS2) address2, rtrim(ADDRESS3) address3, rtrim(CITY) city, rtrim(STATE) state, rtrim(ZIPCODE) postcode, RTRIM(PHNUMBR1) phoneNumber1, RTRIM(PHNUMBR2) phoneNumber2
  FROM [GPLIVE].[GCP].[dbo].[PM00300] WITH (NOLOCK)
  WHERE VENDORID = @vendnmbr
  ORDER BY ADRSCODE ASC
  `;
  return request.input('vendnmbr', TYPES.VarChar(15), vendNmbr).query(query).then((_: IResult<gpRes>) => {return {addresses: _.recordset}});
}

export function getHistory(itemNmbr: string) {
  const request = new sqlRequest();
  const query =
  `
  SELECT * FROM (
    SELECT s.LOCNCODE, SUM(CASE t.SOPTYPE WHEN 3 THEN QUANTITY * QTYBSUOM WHEN 4 THEN QUANTITY * -QTYBSUOM END) / 12 TOTALS
    FROM [GPLIVE].[GCP].[dbo].[SOP30200] s WITH (NOLOCK)
    LEFT JOIN [GPLIVE].[GCP].[dbo].[SOP30300] t WITH (NOLOCK)
    ON s.SOPTYPE = t.SOPTYPE
    AND s.SOPNUMBE = t.SOPNUMBE
    WHERE s.DOCDATE > DATEADD(year,-1,GETDATE())
    AND s.VOIDSTTS = 0
    AND s.SOPTYPE in (3,4)
    AND ITEMNMBR = @itemnmbr
    GROUP BY ITEMNMBR, s.LOCNCODE
  ) a
  PIVOT (
    SUM(TOTALS)
    FOR LOCNCODE IN (HEA, NSW, QLD, WA, SA, MAIN)
  ) Pivot_table
  `;
  return request.input('itemnmbr', TYPES.VarChar(32), itemNmbr).query(query).then((_: IResult<gpRes>) => {
    return {itemNumber: itemNmbr, history: _.recordset[0]};
  });
}

export function getOrdersByLine(branch: string, itemNmbrs: string[], components = false) {
  branch = parseBranch(branch);
  const request = new sqlRequest();
  const items = itemNmbrs.map(_ => `'${_}'`).join(',');
  let query =
  `
  Select a.DOCDATE date,
  CASE WHEN a.ReqShipDate < '19900101' THEN null ELSE a.reqShipDate END reqShipDate,
  a.SOPTYPE sopType, rtrim(a.SOPNUMBE) sopNmbr, rtrim(b.ITEMNMBR) itemNmbr,
  rtrim(a.LOCNCODE) locnCode, (b.ATYALLOC) * b.QTYBSUOM quantity,
  rtrim(c.CUSTNAME) customer, rtrim(c.CUSTNMBR) custNmbr, d.CMMTTEXT note, e.CMMTTEXT lineNote
  FROM [GPLIVE].[GCP].[dbo].[SOP10100] a WITH (NOLOCK)
  LEFT JOIN [GPLIVE].[GCP].[dbo].[SOP10200] b WITH (NOLOCK)
  ON a.SOPTYPE = b.SOPTYPE AND b.SOPNUMBE = a.SOPNUMBE
  LEFT JOIN [GPLIVE].[GCP].[dbo].[RM00101] c WITH (NOLOCK)
  ON a.CUSTNMBR = c.CUSTNMBR
  LEFT JOIN [GPLIVE].[GCP].[dbo].[SOP10106] d WITH (NOLOCK)
  ON a.SOPTYPE = d.SOPTYPE AND a.SOPNUMBE = d.SOPNUMBE
  LEFT JOIN [GPLIVE].[GCP].[dbo].[SOP10202] e WITH (NOLOCK)
  ON b.SOPTYPE = e.SOPTYPE AND b.SOPNUMBE = e.SOPNUMBE AND b.LNITMSEQ = e.LNITMSEQ
  WHERE ${components ? `(b.ITEMNMBR IN (${items}) OR b.ITEMNMBR IN (SELECT ITEMNMBR FROM [GPLIVE].[GCP].[dbo].[BM00111] WITH (NOLOCK) WHERE CMPTITNM IN (${items})))` : `b.ITEMNMBR IN (${items})`}
  AND a.SOPTYPE IN (2, 3, 5)
  `;
  if (branch) query += `
  AND a.LOCNCODE = @locnCode
  `;
  query += `
  ORDER BY a.ReqShipDate ASC
  `;
  return request.input('locnCode', TYPES.VarChar(12), branch).query(query).then((_: IResult<gpRes>) => {return {orders: _.recordset}});
}

export function getOrders(branch: string, batch: string, date: string) {
  const now = date || getNextDay().toLocaleDateString('fr-CA');
  const dt = `${now} 00:00:00.000`;
  branch = parseBranch(branch);
  const branchList = `('${branch}'${branch === 'MAIN' ? ',\'HEA\'': ''})`;
  const request = new sqlRequest();
  const query =
  `
  SELECT
  SUM(LinePicked) linesPicked,
  COUNT (*) as linesTotal,
  COALESCE(SUM(CASE WHEN p.PalletHeight = 1300 THEN 0.5 ELSE 1 END * (pt.FulfilledQuantity * QTYBSUOM / p.PalletQty)), 0) fulfilledSpaces,
  RTRIM(MAX(BACHNUMB)) batchNumber, MAX(DOCDATE) docDate, MAX(ReqShipDate) reqShipDate, rtrim(MAX(LOCNCODE)) locnCode, MAX(a.SOPTYPE) sopType, RTRIM(MAX(a.SOPNUMBE)) sopNumber, MAX(ORIGTYPE) origType, RTRIM(MAX(ORIGNUMB)) origNumber, RTRIM(MAX(CUSTNMBR)) custNumber, rtrim(MAX(a.PRSTADCD)) adrsCode, RTRIM(MAX(CUSTNAME)) custName, RTRIM(MAX(a.CNTCPRSN)) cntPrsn, RTRIM(MAX(a.ADDRESS1)) address1, RTRIM(MAX(a.ADDRESS2)) address2,
  RTRIM(MAX(a.ADDRESS3)) address3, RTRIM(MAX(a.CITY)) city, RTRIM(MAX(a.[STATE])) state, RTRIM(MAX(a.ZIPCODE)) postCode,  RTRIM(MAX(PHNUMBR1)) phoneNumber1, RTRIM(MAX(PHNUMBR2)) phoneNumber2, RTRIM(MAX(a.SHIPMTHD)) shipMethod, MAX(posted) as posted,
  SUM(CASE WHEN p.PalletHeight = 1300 THEN 0.5 ELSE 1 END * ((QTYPRINV + QTYTOINV) * QTYBSUOM / p.PalletQty)) palletSpaces,
  SUM(p.packWeight * (QTYPRINV + QTYTOINV) * QTYBSUOM / COALESCE(p.PackQty, 1)) orderWeight,
  CASE WHEN SUM(CASE WHEN p.packWeight IS NULL THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 end missingWeight,
  MAX(CONVERT (varchar(max), TXTFIELD )) note
  FROM (
    SELECT BACHNUMB, DOCDATE, DOCID, ReqShipDate, LOCNCODE, SOPTYPE, SOPNUMBE, ORIGTYPE, ORIGNUMB, CUSTNMBR, PRSTADCD, CUSTNAME, CNTCPRSN, ADDRESS1, ADDRESS2, ADDRESS3, CITY, [state], ZIPCODE, PHNUMBR1, PHNUMBR2, a.SHIPMTHD, 0 posted, NOTEINDX
    FROM [GPLIVE].[GCP].[dbo].[SOP10100] a WITH (NOLOCK)
    WHERE ReqShipDate = @date
    AND LOCNCODE IN ${branchList}
    AND SOPTYPE = 2
    UNION
    SELECT BACHNUMB, DOCDATE, a.DOCID, COALESCE(c.reqShipDate, a.ReqShipDate) reqShipDate, LOCNCODE, a.SOPTYPE, SOPNUMBE, a.ORIGTYPE, a.ORIGNUMB, a.CUSTNMBR, a.PRSTADCD, CUSTNAME, COALESCE(c.CNTCPRSN, a.CNTCPRSN) cntPrsn, COALESCE(c.ADDRESS1, a.ADDRESS1) ADDRESS1, COALESCE(c.ADDRESS2, a.ADDRESS2) ADDRESS2, COALESCE(c.ADDRESS3, a.ADDRESS3) ADDRESS3, COALESCE(c.CITY, a.CITY) CITY, COALESCE(c.STATE, a.STATE) [STATE], COALESCE(c.ZIPCODE, a.ZIPCODE) ZIPCODE, COALESCE(c.PHNUMBR1, a.PHNUMBR1) PHNUMBR1, COALESCE(c.PHNUMBR2, a.PHNUMBR2) PHNUMBR2, COALESCE(c.SHIPMTHD, a.SHIPMTHD) SHIPMTHD, 1 posted, COALESCE(c.NOTEINDX, a.NOTEINDX)
    FROM [GPLIVE].[GCP].[dbo].[SOP30200] a WITH (NOLOCK)
    LEFT JOIN (
      SELECT SOPTYPE, ORIGTYPE, ORIGNUMB, DOCID, SHIPMTHD, ReqShipDate, CNTCPRSN, ADDRESS1, ADDRESS2, ADDRESS3, CITY, [STATE], ZIPCODE, PHNUMBR1, PHNUMBR2, NOTEINDX
      FROM [GPLIVE].[GCP].[dbo].[SOP10100] WITH (NOLOCK)
      WHERE ReqShipDate = @date
      AND LOCNCODE IN ${branchList}
      AND SOPTYPE = 3
      UNION
      SELECT SOPTYPE, ORIGTYPE, ORIGNUMB, DOCID, SHIPMTHD, ReqShipDate, CNTCPRSN, ADDRESS1, ADDRESS2, ADDRESS3, CITY, [STATE], ZIPCODE, PHNUMBR1, PHNUMBR2, NOTEINDX
      FROM [GPLIVE].[GCP].[dbo].[SOP30200] WITH (NOLOCK)
      WHERE ReqShipDate = @date
      AND LOCNCODE IN ${branchList}
      AND SOPTYPE = 3
    ) c
    ON a.SOPTYPE = c.ORIGTYPE
    AND a.SOPNUMBE = c.ORIGNUMB
    WHERE a.SOPTYPE = 2
    AND LOCNCODE IN ${branchList}
  ) a
  LEFT JOIN [GPLIVE].[GCP].[dbo].[SY03900] n WITH (NOLOCK)
  ON a.NOTEINDX = n.NOTEINDX
  LEFT JOIN [IMS].[dbo].Deliveries d WITH (NOLOCK)
  ON a.SOPNUMBE = d.OrderNumber
  LEFT JOIN (
    SELECT SOPNUMBE, SOPTYPE, LNITMSEQ, ITEMNMBR, QTYPRINV, QTYTOINV, QTYBSUOM FROM [GPLIVE].[GCP].[dbo].[SOP10200] e WITH (NOLOCK)
    UNION
    SELECT SOPNUMBE, SOPTYPE, LNITMSEQ, ITEMNMBR, QTYPRINV, QTYTOINV, QTYBSUOM FROM [GPLIVE].[GCP].[dbo].[SOP30300] f WITH (NOLOCK)
  ) b
  ON a.SOPTYPE = b.SOPTYPE
  AND a.SOPNUMBE = b.SOPNUMBE
  LEFT JOIN (
    SELECT Product, PalletHeight, PalletQty, PackQty, PackWeight, ROW_NUMBER() OVER(PARTITION BY Product ORDER BY Product DESC) rn
    FROM [PERFION].[GCP-Perfion-LIVE].[dbo].[ProductSpecs] WITH (NOLOCK)
    WHERE COALESCE(PalletQty, PackQty, PalletHeight, PackWeight) IS NOT null
  ) p
  ON ITEMNMBR = p.Product
  LEFT JOIN ( 
    SELECT o.SalesOrderCode, u.LineNumber, SUM(u.FulfilledQuantity) FulfilledQuantity, 1 as LinePicked
    FROM [GPLIVE].[PanatrackerGP].[dbo].[TrxFulfillOrder] o WITH (NOLOCK)
    LEFT JOIN [GPLIVE].[PanatrackerGP].[dbo].[TrxFulfillOrderUnit] u
    ON u.TrxFulfillOrderOid = o.Oid
    GROUP BY SalesOrderCode, LineNumber
  ) pt
  ON a.SOPNUMBE = pt.SalesOrderCode AND LNITMSEQ = pt.LineNumber
  WHERE a.reqShipDate = @date
  AND (rn = 1 OR rn IS null)
  AND a.locnCode IN ${branchList}
  AND DOCID <> 'MAINFO'
  AND (d.Status <> 'Archived' OR d.Status IS NULL)
  GROUP BY a.SOPTYPE, a.SOPNUMBE, CUSTNAME
  ORDER BY CUSTNAME
  `;
  return request.input('date', TYPES.VarChar(23), dt).query(query).then((_: IResult<Order>) => {
    _.recordset.forEach(o => {
      o['note'] = [...(o.note || '').matchAll(driverNoteRegexp)].map(_ => _[1]).join('\r\n');
      o['pickStatus'] = o['posted'] || o['batchNumber'] === 'FULFILLED' ? 2 : o['batchNumber'] === 'INTERVENE' ? 1 : 0;
    });
    return {orders: _.recordset};
  });
}

export function getOrderLines(sopType: number, sopNumber: string) {
  const request = new sqlRequest();
  const query =
  `
  SELECT a.SOPTYPE sopType, RTRIM(a.SOPNUMBE) sopNumbe, RTRIM(a.BACHNUMB) batchNumber, RTRIM(a.CUSTNMBR) custNmbr, RTRIM(a.CUSTNAME) custName, LNITMSEQ lineNumber, RTRIM(b.ITEMNMBR) itemNmbr, RTRIM(b.ITEMDESC) itemDesc, QUANTITY * QTYBSUOM quantity, QTYPRINV * QTYBSUOM qtyPrInv, QTYTOINV * QTYBSUOM qtyToInv, REQSHIPDATE reqShipDate, RTRIM(a.CNTCPRSN) cntPrsn, RTRIM(a.Address1) address1, RTRIM(a.ADDRESS2) address2, RTRIM(a.ADDRESS3) address3, RTRIM(a.CITY) city, RTRIM(a.[STATE]) state, RTRIM(a.ZIPCODE) postCode, RTRIM(a.SHIPMTHD) shipMethod, n.TXTFIELD note, posted,
  CASE WHEN p.PalletHeight = 1300 THEN 0.5 ELSE 1 END * ((QTYPRINV + QTYTOINV) * QTYBSUOM / p.PalletQty) palletSpaces,
  p.packWeight * (QTYPRINV + QTYTOINV) * QTYBSUOM / p.packQty lineWeight, 
  d.Status deliveryStatus, d.Run deliveryRun, RTRIM(UOFM) uom, QTYPRINV packQty, Attachments attachments

  FROM (
    SELECT BACHNUMB, DOCDATE, ReqShipDate, LOCNCODE, SOPTYPE, SOPNUMBE, ORIGTYPE, ORIGNUMB, CUSTNMBR, PRSTADCD, CUSTNAME, CNTCPRSN, ADDRESS1, ADDRESS2, ADDRESS3, CITY, [state], ZIPCODE, PHNUMBR1, PHNUMBR2, a.SHIPMTHD, 0 posted, NOTEINDX
    FROM [GPLIVE].[GCP].[dbo].[SOP10100] a WITH (NOLOCK)
    WHERE SOPTYPE = 2
    UNION
    SELECT BACHNUMB, DOCDATE, COALESCE(c.reqShipDate, a.ReqShipDate) reqShipDate, LOCNCODE, a.SOPTYPE, SOPNUMBE, a.ORIGTYPE, a.ORIGNUMB, a.CUSTNMBR, a.PRSTADCD, CUSTNAME, COALESCE(c.CNTCPRSN, a.CNTCPRSN) cntPrsn, COALESCE(c.ADDRESS1, a.ADDRESS1) ADDRESS1, COALESCE(c.ADDRESS2, a.ADDRESS2) ADDRESS2, COALESCE(c.ADDRESS3, a.ADDRESS3) ADDRESS3, COALESCE(c.CITY, a.CITY) CITY, COALESCE(c.STATE, a.STATE) [STATE], COALESCE(c.ZIPCODE, a.ZIPCODE) ZIPCODE, COALESCE(c.PHNUMBR1, a.PHNUMBR1) PHNUMBR1, COALESCE(c.PHNUMBR2, a.PHNUMBR2) PHNUMBR2, COALESCE(c.SHIPMTHD, a.SHIPMTHD) SHIPMTHD, 1 posted, COALESCE(c.NOTEINDX, a.NOTEINDX)
    FROM [GPLIVE].[GCP].[dbo].[SOP30200] a WITH (NOLOCK)

    LEFT JOIN (
      SELECT SOPTYPE, ORIGTYPE, ORIGNUMB, SHIPMTHD, ReqShipDate, CNTCPRSN, ADDRESS1, ADDRESS2, ADDRESS3, CITY, [STATE], ZIPCODE, PHNUMBR1, PHNUMBR2, NOTEINDX
      FROM [GPLIVE].[GCP].[dbo].[SOP10100] WITH (NOLOCK)
      WHERE SOPTYPE = 3
      UNION
      SELECT SOPTYPE, ORIGTYPE, ORIGNUMB, SHIPMTHD, ReqShipDate, CNTCPRSN, ADDRESS1, ADDRESS2, ADDRESS3, CITY, [STATE], ZIPCODE, PHNUMBR1, PHNUMBR2, NOTEINDX
      FROM [GPLIVE].[GCP].[dbo].[SOP30200] WITH (NOLOCK)
      WHERE SOPTYPE = 3
    ) c
    ON a.SOPTYPE = c.ORIGTYPE
    AND a.SOPNUMBE = c.ORIGNUMB
    WHERE a.SOPTYPE = 2
  ) a
  LEFT JOIN [GPLIVE].[GCP].[dbo].[SY03900] n WITH (NOLOCK)
  ON a.NOTEINDX = n.NOTEINDX
  LEFT JOIN (
    SELECT SOPNUMBE, SOPTYPE, LNITMSEQ, ITEMNMBR, ITEMDESC, QUANTITY, QTYPRINV, QTYTOINV, UOFM, QTYBSUOM FROM [GPLIVE].[GCP].[dbo].[SOP10200] e WITH (NOLOCK)
    UNION
    SELECT SOPNUMBE, SOPTYPE, LNITMSEQ, ITEMNMBR, ITEMDESC, QUANTITY, QTYPRINV, QTYTOINV, UOFM, QTYBSUOM FROM [GPLIVE].[GCP].[dbo].[SOP30300] f WITH (NOLOCK)
  ) b
  ON a.SOPTYPE = b.SOPTYPE
  AND a.SOPNUMBE = b.SOPNUMBE
  LEFT JOIN (
    SELECT Product, PalletQty, PalletHeight, PackWeight, PackQty, ROW_NUMBER() OVER(PARTITION BY Product ORDER BY Product DESC) rn
    FROM [PERFION].[GCP-Perfion-LIVE].[dbo].[ProductSpecs] WITH (NOLOCK)
    WHERE COALESCE(PalletQty, PackQty, PalletHeight, PackWeight) IS NOT null
  ) p
  ON ITEMNMBR = p.Product
  LEFT JOIN [IMS].[dbo].Deliveries d WITH (NOLOCK)
  ON a.SOPNUMBE = d.OrderNumber
  WHERE a.SOPNUMBE = @sopNumber
  AND (rn = 1 OR rn IS NULL)
  ORDER BY LNITMSEQ
  `;
  const lines = request.input('soptype', TYPES.SmallInt, sopType).input('sopnumber', TYPES.Char(21), sopNumber).query(query);
  return lines.then((_: IResult<Array<Line>>) => {
    const order = _.recordset[0] as unknown as Order;
    if (!order) return {};
    const noteMatch = [...(order.note || '').matchAll(driverNoteRegexp)].map(_ => _[1]).join('\r\n');
    const pickStatus = (order['posted'] || order['batchNumber'] === 'FULFILLED') ? 2 : order['batchNumber'] === 'INTERVENE' ? 1 : 0
    return {
      custNumber: order.custNmbr,
      custName: order.custName,
      sopType: order.sopType,
      sopNumber: order.sopNumbe,
      cntPrsn: order.cntPrsn,
      address1: order.address1,
      address2: order.address2,
      address3: order.address3,
      city: order.city,
      state: order.state,
      postCode: order.postCode,
      shipMethod: order.shipMethod,
      reqShipDate: new Date(order.reqShipDate),
      note: noteMatch,
      pickStatus: pickStatus,
      deliveryStatus: order.deliveryStatus,
      deliveryRun: order.deliveryRun,
      attachments: order.attachments,
      lines: _.recordset.map(l => {
        return {
          lineNumber: l.lineNumber,
          itemNmbr: l.itemNmbr,
          itemDesc: l.itemDesc,
          quantity: l.quantity,
          qtyPrInv: l.qtyPrInv,
          qtyToInv: l.qtyToInv,
          palletSpaces: l.palletSpaces,
          lineWeight: l.lineWeight,
          uom: l.uom.replace('EACH', 'Each'),
          packQty: l.packQty
        }
      })
    }
  });
}

export function getDeliveries(branch: string, run: string, deliveryType: string, archived: boolean, orderNumberQuery: string) {
  const request = new sqlRequest();
  const limit = archived ? 'TOP(250)' : ''
  let query =
  `
  SELECT ${limit} Address, RTRIM(Branch) Branch, City, ContactPerson, Created, Creator, CustomerName, RTRIM(CustomerNumber) CustomerNumber, CustomerType, Date, Delivered, DeliveryDate, DeliveryType, Notes, RTRIM(OrderNumber) OrderNumber, PhoneNumber, PickStatus, Postcode, RequestedDate, Run, Sequence, Site, Spaces, State, Status, Weight, Attachments, id
  FROM [IMS].[dbo].[Deliveries] d WITH (NOLOCK)
  WHERE Branch = @branch
  AND Status ${archived ? '=' : '<>'} 'Archived'
  ${run !== undefined ? 'AND Run = @run' : ''}
  ${deliveryType ? 'AND DeliveryType = @deliveryType' : ''}
  `;
  if (orderNumberQuery) query += ` AND OrderNumber LIKE '%' + @orderNumberQuery + '%'`;
  query += ` ORDER BY ${archived ? 'DeliveryDate DESC' : 'Sequence ASC'}`;
  return request.input('branch', TYPES.Char(15), branch).input('run', TYPES.NVarChar(50), run).input('deliveryType', TYPES.VarChar(50), deliveryType).input('orderNumberQuery', TYPES.VarChar(50), orderNumberQuery).query(query).then((_: IResult<Delivery>) => {
    return {value: _.recordset.map(r =>  {return {id: r.id, fields: r};})}
  });
}

export async function addDelivery(delivery: Delivery, userName: string, userEmail: string): Promise<{id: number, fields: Delivery}> {
  const getQuery = 'SELECT * FROM [IMS].[dbo].Deliveries WHERE OrderNumber = @orderNumber';
  const getRequest = new sqlRequest()
  const res = await getRequest.input('OrderNumber', TYPES.Char(21), delivery.OrderNumber).query(getQuery);
  if (res.recordset.length > 0 && res.recordset[0].Status) throw {message: `Order already on run: ${res.recordset[0].Run}`};

  const updateQuery = `
  UPDATE [IMS].[dbo].Deliveries
  SET Run=@Run,Status=@Status,CustomerName=@CustomerName,CustomerNumber=@CustomerNumber,City=@City,State=@State,PostCode=@PostCode,Site=@Site,Address=@Address,CustomerType=@CustomerType,ContactPerson=@ContactPerson,DeliveryDate=@DeliveryDate,OrderNumber=@OrderNumber,Spaces=@Spaces,Weight=@Weight,PhoneNumber=@PhoneNumber,Branch=@Branch,Created=@Created,Creator=@Creator,Notes=@Notes,DeliveryType=@DeliveryType,RequestedDate=@RequestedDate
  OUTPUT @userName, @userEmail, INSERTED.OrderNumber, INSERTED.CustomerNumber, INSERTED.Branch, INSERTED.Run, 'added', getDate()
  INTO [IMS].[dbo].[Actions] (UserName, UserEmail, OrderNumber, CustomerNumber, Branch, toRun, Action, Date)
  WHERE OrderNumber = @orderNumber;
  SELECT @id = ${res.recordset[0].id};
  `
  const insertQuery = `
  INSERT INTO [IMS].[dbo].Deliveries (Run,Status,CustomerName,CustomerNumber,City,State,PostCode,Site,Address,CustomerType,ContactPerson,DeliveryDate,OrderNumber,Spaces,Weight,PhoneNumber,Branch,Created,Creator,Notes,DeliveryType,RequestedDate)
  OUTPUT @userName, @userEmail, INSERTED.OrderNumber, INSERTED.CustomerNumber, INSERTED.Branch, INSERTED.Run, 'added', getDate()
  INTO [IMS].[dbo].[Actions] (UserName, UserEmail, OrderNumber, CustomerNumber, Branch, toRun, Action, Date)
  VALUES (@Run,@Status,@CustomerName,@CustomerNumber,@City,@State,@PostCode,@Site,@Address,@CustomerType,@ContactPerson,@DeliveryDate,@OrderNumber,@Spaces,@Weight,@PhoneNumber,@Branch,@Created,@Creator,@Notes,@DeliveryType,@RequestedDate);
  SELECT @id = SCOPE_IDENTITY();
  `;

  const request = new sqlRequest()
  request.input('Run', TYPES.NVarChar(50), delivery.Run);
  request.input('Status', TYPES.VarChar(50), 'Active');
  request.input('CustomerName', TYPES.VarChar(65), delivery.CustomerName);
  request.input('CustomerNumber', TYPES.Char(15), delivery.CustomerNumber);
  request.input('Site', TYPES.NVarChar(50), delivery.Site);
  request.input('City', TYPES.VarChar(35), delivery.City);
  request.input('State', TYPES.VarChar(29), delivery.State);
  request.input('Postcode', TYPES.VarChar(11), delivery.Postcode);
  request.input('Address', TYPES.VarChar(MAX), delivery.Address);
  request.input('CustomerType', TYPES.VarChar(50), delivery.CustomerType);
  request.input('ContactPerson', TYPES.VarChar(61), delivery.ContactPerson);
  request.input('DeliveryDate', TYPES.Date, delivery.DeliveryDate);
  request.input('OrderNumber', TYPES.Char(21), delivery.OrderNumber);
  request.input('Spaces', TYPES.Numeric(19, 5), delivery.Spaces);
  request.input('Weight', TYPES.Numeric(19, 5), delivery.Weight);
  request.input('PhoneNumber', TYPES.VarChar(50), delivery.PhoneNumber);
  request.input('Branch', TYPES.Char(15), delivery.Branch);
  request.input('Created', TYPES.Date, delivery.Created);
  request.input('Creator', TYPES.NVarChar(50), delivery.Creator);
  request.input('Notes', TYPES.NVarChar(MAX), delivery.Notes);
  request.input('DeliveryType', TYPES.VarChar(50), delivery.DeliveryType);
  request.input('RequestedDate', TYPES.Date, delivery.RequestedDate);
  request.input('userName', TYPES.NVarChar(50), userName);
  request.input('userEmail', TYPES.NVarChar(320), userEmail);
  request.output('id', TYPES.Int);
  return request.query(res.recordset.length > 0 ? updateQuery : insertQuery).then(_ => {
    const id = _['output']['id'] as number;
    return {id, fields: {...delivery, id}};
  });
}

export async function updateDelivery(id: number, delivery: Delivery, userName: string, userEmail: string): Promise<{body: {fields: Delivery, id: number}} | void> {
  const updates = [];
  if ('Sequence' in delivery) updates.push('Sequence = @Sequence');
  if ('Run' in delivery) updates.push('Run = @Run');
  if ('Notes' in delivery) updates.push('Notes = @Notes');
  if ('Status' in delivery) updates.push('Status = @Status');
  if ('RequestedDate' in delivery) updates.push('RequestedDate = @RequestedDate');
  if ('PickStatus' in delivery) updates.push('PickStatus = @PickStatus');
  if ('DeliveryDate' in delivery) updates.push('DeliveryDate = @DeliveryDate');
  if ('CustomerNumber' in delivery) updates.push('CustomerNumber = @CustomerNumber');
  if ('CustomerName' in delivery) updates.push('CustomerName = @CustomerName');
  if ('Address' in delivery) updates.push('Address = @Address');
  if ('Site' in delivery) updates.push('Site = @Site');
  let updateQuery = `
  UPDATE [IMS].[dbo].Deliveries
  SET ${updates.join()}
  `
  if ('Run' in delivery) {
    updateQuery += `
      OUTPUT @userName, @userEmail, inserted.OrderNumber, inserted.CustomerNumber, inserted.Branch, deleted.Run, inserted.Run, 'moved', getDate()
      INTO [IMS].[dbo].[Actions] (UserName, UserEmail, OrderNumber, CustomerNumber, Branch, FromRun, toRun, Action, Date)
    `;
  }
  if ('Status' in delivery) {
    updateQuery += `
      OUTPUT @userName, @userEmail, inserted.OrderNumber, inserted.CustomerNumber, inserted.Branch, inserted.Run, inserted.Run, @statusSmall, getDate()
      INTO [IMS].[dbo].[Actions] (UserName, UserEmail, OrderNumber, CustomerNumber, Branch, FromRun, toRun, Action, Date)
    `;
  }
  updateQuery += `
  OUTPUT inserted.Address, RTRIM(inserted.Branch) Branch, inserted.City, inserted.ContactPerson, inserted.Created, inserted.Creator, inserted.CustomerName, RTRIM(inserted.CustomerNumber) CustomerNumber, inserted.CustomerType, inserted.Date, inserted.Delivered, inserted.DeliveryDate, inserted.DeliveryType, inserted.Notes, RTRIM(inserted.OrderNumber) OrderNumber, inserted.PhoneNumber, inserted.PickStatus, inserted.Postcode, inserted.RequestedDate, inserted.Run, inserted.Sequence, inserted.Site, inserted.Spaces, inserted.State, inserted.Status, inserted.Weight, inserted.id
  WHERE id = @id
  `;
  const request = new sqlRequest();
  request.input('RequestedDate', TYPES.Date, delivery.RequestedDate);
  request.input('DeliveryDate', TYPES.Date, delivery.DeliveryDate);
  request.input('PickStatus', TYPES.TinyInt, delivery.PickStatus);
  request.input('Sequence', TYPES.Int, delivery.Sequence);
  request.input('Notes', TYPES.NVarChar(MAX), delivery.Notes);
  request.input('CustomerNumber', TYPES.Char(15), delivery.CustomerNumber);
  request.input('CustomerName', TYPES.VarChar(65), delivery.CustomerName);
  request.input('Address', TYPES.NVarChar(MAX), delivery.Address);
  request.input('Site', TYPES.NVarChar(50), delivery.Site);
  request.input('Run', TYPES.NVarChar(50), delivery.Run);
  request.input('Status', TYPES.VarChar(50), delivery.Status);
  request.input('StatusSmall', TYPES.VarChar(50), delivery.Status?.toLocaleLowerCase() || '');
  request.input('id', TYPES.Int, id);
  request.input('userName', TYPES.NVarChar(50), userName);
  request.input('userEmail', TYPES.NVarChar(320), userEmail);
  return request.query(updateQuery).then(_ => {
    const delivery = _.recordset[0] as Delivery;
    return {body: {fields: delivery, id}};
  }).catch(
    e => {
      if (updates.length === 0) throw 'No fields to update.';
      throw 'Unknown error';
    }
  );
}

export function removeDelivery(id: number, userName: string, userEmail: string): Promise<IResult<any>> {
  const deleteQuery = `
  UPDATE [IMS].[dbo].[Deliveries]
  SET Status = NULL, Run = NULL, Sequence = NULL
  OUTPUT @userName, @userEmail, deleted.OrderNumber, deleted.CustomerNumber, deleted.Branch, deleted.Run, 'deleted', getDate()
  INTO [IMS].[dbo].[Actions] (UserName, UserEmail, OrderNumber, CustomerNumber, Branch, FromRun, Action, Date)
  WHERE id = @id
  `;
  return new sqlRequest().input('id', TYPES.Int, id).input('userName', TYPES.NVarChar(50), userName).input('userEmail', TYPES.NVarChar(320), userEmail).query(deleteQuery).then((_) => _);
}

export function getChemicals(branch: string, itemNumber: string, type: string, order: string, orderby: string): Promise<{chemicals: CwRow[]}> {
  branch = parseBranch(branch);
  const request = new sqlRequest();
  let query1 =
  `
  SELECT RTRIM(a.ITEMNMBR) ItemNmbr,
  RTRIM(ITEMDESC) ItemDesc,
  b.QTYONHND onHand,
  (SELECT TOP 1 BIN FROM [GPLIVE].[GCP].[dbo].[IV00112] WITH (NOLOCK) WHERE ITEMNMBR = a.ITEMNMBR and LOCNCODE = b.LOCNCODE AND QUANTITY > 0 ORDER BY QUANTITY DESC) Bin,
  rtrim(c.BIN) PriorityBin,
  Coalesce(Pkg, '') packingGroup,
  Coalesce(Dgc, '') class,
  Coalesce(Replace(HazardRating, -1, ''), '') hazardRating,
  Name, HCodes, OnChemwatch, IssueDate, ExtractionDate, VendorName, Country, Language, DocNo,
  CASE WHEN e.CwNo IS NOT NULL THEN 1 ELSE 0 END sdsExists,
  1 Inventory
  FROM [GPLIVE].[GCP].[dbo].[IV00101] a WITH (NOLOCK)
  LEFT JOIN [GPLIVE].[GCP].[dbo].[IV00102] b WITH (NOLOCK) ON a.ITEMNMBR = b.ITEMNMBR
  LEFT JOIN (SELECT * FROM [GPLIVE].[GCP].[dbo].[IV00117] WITH (NOLOCK) WHERE PRIORITY = 1) c ON a.ITEMNMBR = c.ITEMNMBR AND b.LOCNCODE = c.LOCNCODE
  LEFT JOIN [IMS].[dbo].[ProductLinks] d WITH (NOLOCK) ON a.ITEMNMBR = d.ITEMNMBR
  LEFT JOIN [IMS].[dbo].[Materials] e WITH (NOLOCK) ON d.CwNo = e.CwNo
  LEFT JOIN (SELECT PropertyValue, ObjectID FROM [GPLIVE].[GCP].[dbo].[SY90000] WITH (NOLOCK) WHERE ObjectType = 'ItemCatDesc') f ON a.ITEMNMBR = f.ObjectID
  WHERE a.ITMCLSCD IN ('ADDITIVE', 'BASACOTE', 'CHEMICALS', 'FERTILIZER', 'NUTRICOTE', 'OCP', 'OSMOCOTE', 'SEASOL')
  AND b.LOCNCODE = @locnCode
  AND f.PropertyValue != 'Hardware & Accessories'
  `;

  if (branch) query1 += `
  AND b.QTYONHND > 0
  `;

  if (itemNumber) query1 += `
  AND a.ITEMNMBR = @itemNumber
  `;

  let query2 = `
  SELECT a.ItemNmbr,
    CONCAT(a.ItemDesc, ' - ', CAST(ContainerSize AS float), ' ', Units) AS ItemDesc,
    b.Quantity onHand,
    '' Bin,
    '' PriorityBin,
    Coalesce(e.Pkg, '') packingGroup,
    Coalesce(Dgc, '') class,
    Coalesce(Replace(HazardRating, -1, ''), '') hazardRating,
    Name, HCodes, OnChemwatch, IssueDate, ExtractionDate, VendorName, Country, Language, DocNo,
    CASE WHEN e.CwNo IS NOT NULL THEN 1 ELSE 0 END sdsExists,
    0 Inventory
  FROM [IMS].[dbo].[Consumables] a WITH (NOLOCK)
  LEFT JOIN [IMS].[dbo].[Quantities] b WITH (NOLOCK) ON a.ITEMNMBR = b.ITEMNMBR
  LEFT JOIN [IMS].[dbo].[ProductLinks] d WITH (NOLOCK) ON a.ItemNmbr = d.ITEMNMBR
  LEFT JOIN [IMS].[dbo].[Materials] e WITH (NOLOCK) ON d.CwNo = e.CwNo
  WHERE COALESCE(b.Site, '') = @locnCode
  `;

  if (branch) query2 += `
  AND b.Quantity > 0
  `;

  if (itemNumber) query2 += `
  AND a.ITEMNMBR = @itemNumber
  `;
  let query = type === 'inventory' ? query1 : type === 'nonInventory' ? query2 : `${query1} UNION ${query2}`;
  if (orderby && orderby !== 'quantity') query += ` ORDER BY ${orderby.replace('product', 'ITEMNMBR') || 'ITEMNMBR'} ${order || 'ASC'}`;
  return request.input('locnCode', TYPES.VarChar(12), branch).input('itemNumber', TYPES.VarChar(31), itemNumber).query(query).then((_: IResult<CwRow[]>) => {
    _.recordset.map(c => {
      c['hCodes'] = c.HCodes !== '-' ? c.HCodes?.split(',') : [];
      delete c.HCodes;
    })
    const chemicals = _.recordset.map(c => {
      const carton = (c.ItemDesc as string).toLocaleLowerCase().match(cartonRegexp);
      const cartonMulti = carton ? parseInt(carton[1], 10) : 1;
      const match = (c.ItemDesc as string).toLocaleLowerCase().replace(ignoreRegexp, '').match(sizeRegexp);
      if (match) {
        c['size'] = (Number(match[1]) * cartonMulti) / dct[match[2]]['divisor'];
        c['uofm'] = dct[match[2].toLocaleLowerCase()]['uom'];
        c['quantity'] = c['size'] * (c.onHand as number);
      } else if ((c.ItemDesc as string).startsWith('Perlite')) {
        c['size'] = 100;
        c['uofm'] = 'L';
        c['quantity'] = c['size'] * (c.onHand as number);
      }
      return c;
    }).filter(_ => _['size'] !== undefined);
    return {chemicals: (orderby === 'quantity') ? order === 'asc' ?
      chemicals.sort((a, b) => (a.quantity as number || 0) - (b.quantity as number || 0)) :
      chemicals.sort((a, b) => (b.quantity as number || 0) - (a.quantity as number || 0)) :
      chemicals
    };
  });
}

export function getChemicalsOnRun(branch: string, run: string) {
  const request = new sqlRequest();
  let query = `
  SELECT d.Run, RTRIM(b.ITEMNMBR) ItemNmbr, MAX(m.pkg) packingGroup, MAX(m.[HazardRating]) [hazardRating], MAX(m.[Dgc]) [Dgc], RTRIM(MAX(b.ITEMDESC)) ItemDesc, MAX(m.Name) itemName, SUM(QTYPRINV * QTYBSUOM) quantity
  FROM (
    SELECT SOPTYPE, SOPNUMBE
    FROM [GPLIVE].[GCP].[dbo].[SOP10100] a WITH (NOLOCK)
    WHERE SOPTYPE = 2
    UNION ALL
    SELECT a.SOPTYPE, SOPNUMBE
    FROM [GPLIVE].[GCP].[dbo].[SOP30200] a WITH (NOLOCK)
    LEFT JOIN (
      SELECT SOPTYPE, ORIGTYPE, ORIGNUMB FROM [GPLIVE].[GCP].[dbo].[SOP10100] WITH (NOLOCK) WHERE SOPTYPE = 3
      UNION
      SELECT SOPTYPE, ORIGTYPE, ORIGNUMB FROM [GPLIVE].[GCP].[dbo].[SOP30200] WITH (NOLOCK) WHERE SOPTYPE = 3
    ) c
    ON a.SOPTYPE = c.ORIGTYPE AND a.SOPNUMBE = c.ORIGNUMB
    WHERE a.SOPTYPE = 2
  ) a
  LEFT JOIN (
    SELECT SOPNUMBE, SOPTYPE, ITEMNMBR, ITEMDESC, QTYPRINV, QTYBSUOM FROM [GPLIVE].[GCP].[dbo].[SOP10200] e WITH (NOLOCK) WHERE QTYPRINV * QTYBSUOM > 0
    UNION
    SELECT SOPNUMBE, SOPTYPE, ITEMNMBR, ITEMDESC, QTYPRINV, QTYBSUOM FROM [GPLIVE].[GCP].[dbo].[SOP30300] f WITH (NOLOCK) WHERE QTYPRINV * QTYBSUOM > 0
  ) b
  ON a.SOPTYPE = b.SOPTYPE
  AND a.SOPNUMBE = b.SOPNUMBE
  LEFT JOIN [GPLIVE].[GCP].[dbo].[IV00101] i WITH (NOLOCK)
  ON i.ITEMNMBR = b.ITEMNMBR
  LEFT JOIN [IMS].[dbo].ProductLinks l WITH (NOLOCK)
  ON l.ITEMNMBR = b.ITEMNMBR
  LEFT JOIN [IMS].[dbo].Materials m WITH (NOLOCK)
  ON l.CwNo = m.CwNo
  LEFT JOIN [IMS].[dbo].Deliveries d WITH (NOLOCK)
  ON d.OrderNumber = a.SOPNUMBE
  WHERE d.Branch = @branch
  AND d.Status = 'Active'
  `;

  if (run) query += `
  AND d.Run = @run
  `;

  query += `
  AND m.OnChemwatch = 1 
  AND i.ITMCLSCD IN ('ADDITIVE', 'BASACOTE', 'CHEMICALS', 'FERTILIZER', 'NUTRICOTE', 'OCP', 'OSMOCOTE', 'SEASOL')
  GROUP BY d.Run, b.ITEMNMBR
  `;
  return request.input('branch', TYPES.Char(15), branch).input('run', TYPES.NVarChar(50), run).query(query).then((_: IResult<{Run: string, ItemNmbr: string, ItemDesc: string, itemName: string, Quantity: number, Dgc: number}[]>) => _.recordset);
}

export function getBasicChemicalInfo(itemNumber: string): Promise<{docNo: string, cwNo: string}> {
  const request = new sqlRequest();
  const query = 
  `
  SELECT DocNo docNo, b.CwNo cwNo
  FROM [IMS].[dbo].[ProductLinks] a
  LEFT JOIN [IMS].[dbo].[Materials] b ON a.CwNo = b.CwNo
  WHERE a.ITEMNMBR = @itemNumber
  `;
  return request.input('itemNumber', TYPES.VarChar(31), itemNumber).query(query).then((_: IResult<{docNo: string, cwNo: string}[]>) => _.recordset[0] ? _.recordset[0] : {docNo: '', cwNo: ''});
}

export function updatePallets(customer: string, palletType: string, palletQty: string): Promise<IProcedureResult<any>> {
  customer = customer.trimEnd();
  const qty = parseInt(palletQty, 10);
  if (!customer || !palletType || !palletQty === undefined) throw 'Missing info';
  if (customer.length > 15) throw 'Bad request';
  if (!allowedPallets.includes(palletType)) throw 'Bad pallet';
  if (qty > 1000 || palletQty !== qty.toString(10)) throw 'Bad quantity';
  const request = new sqlRequest();
  request.input('Customer', TYPES.Char(15), customer);
  request.input('PalletType', TYPES.Char(15), palletType);
  request.input('Qty', TYPES.Int, qty.toString(10));
  return request.execute(palletStoredProcedure);
}

export function getProduction(): Promise<{lines: any[]}> {
  const request = new sqlRequest();
  return request.execute(productionStoredProcedure).then(_ => {return {lines: _.recordset}});
}

export async function writeInTransitTransferFile(id: string | null, fromSite: string, toSite: string, body: Array<Line>): Promise<string> {
  if (!id) id = await createIttId(toSite);
  fromSite = parseBranch(fromSite);
  toSite = parseBranch(toSite);
  let i = 0;
  const header = ['Id', 'Seq', 'Transfer Date', 'From Site', 'To Site', 'Item Number', 'Qty Shipped'];
  const date = new Date().toLocaleDateString('fr-CA');
  const lines = body.map(_ => [id, i += 1, date, fromSite, toSite, _.ItemNmbr, _.ToTransfer]).map(_ => _.join(','));
  const path = `${targetDir}/PICKS/ITT Between SITES`
  const fileContents = `${header.join(',')}\r\n${lines.join('\r\n')}`;
  fs.writeFileSync(`${path}/itt_transfer_from_${fromSite}_to_${toSite}.csv`, fileContents);
  setTimeout(() => fs.writeFileSync(`${path}/${new Date().getTime()}.txt`, ''), 5000);
  return id;
}

export async function linkChemical(itemNmbr: string, cwNo: string): Promise<CwRow> {
  const getQuery = 'SELECT ITEMNMBR, CwNo FROM [IMS].[dbo].[ProductLinks] WHERE ITEMNMBR = @itemNmbr';
  const currentCount = await new sqlRequest().input('itemNmbr', TYPES.VarChar(31), itemNmbr).query(getQuery).then((_: IResult<gpRes>) => _.recordset.length);
  const updateQuery = currentCount === 0 ?
  `INSERT INTO [IMS].[dbo].[ProductLinks] (ITEMNMBR, CwNo) VALUES (@itemNmbr, @cwNo)` :
  `UPDATE [IMS].[dbo].[ProductLinks] SET CwNo = @cwNo WHERE ITEMNMBR = @itemNmbr`;
  await new sqlRequest().input('itemNmbr', TYPES.VarChar(50), itemNmbr).input('cwNo', TYPES.VarChar(50), cwNo).query(updateQuery);
  await copyPdfToItem(itemNmbr).catch(async _ => {
    await unlinkChemical(itemNmbr);
    throw _;
  });
  return await getChemicals('', itemNmbr, '', '', '').then(c => c['chemicals'][0]);
}

export async function unlinkChemical(itemNmbr: string): Promise<CwRow> {
  const deleteQuery = `DELETE FROM [IMS].[dbo].[ProductLinks] WHERE ITEMNMBR = @itemNmbr`
  await new sqlRequest().input('itemNmbr', TYPES.VarChar(50), itemNmbr).query(deleteQuery);
  await removePdfFromItem(itemNmbr);
  return await getChemicals('', itemNmbr, '', '', '').then(c => c['chemicals'][0]);
}

export function getSyncedChemicals(): Promise<{chemicals: IRecordSet<CwRow>}> {
  const request = new sqlRequest();
  const query = 'SELECT CwNo, Name FROM [IMS].[dbo].[Materials] WHERE onchemwatch = 1 ORDER BY Name ASC';
  return request.query(query).then((_: IResult<CwRow>) => {return {chemicals: _.recordset}});
}

export function getNonInventoryChemicals(site: string): Promise<{chemicals: IRecordSet<CwRow>}> {
  const request = new sqlRequest();
  const query = `
  SELECT a.ItemNmbr,
  CONCAT(ItemDesc, ' - ', CAST(ContainerSize AS float), Units) ItemDesc,
  ContainerSize,
  Units,
  b.Quantity quantity
  FROM [IMS].[dbo].[Consumables] a
  LEFT JOIN (SELECT * FROM [IMS].[dbo].[Quantities] WHERE Site = @site) b
  ON a.ItemNmbr = b.ItemNmbr
  ORDER BY ItemDesc ASC
  `;
  return request.input('site', TYPES.Char(11), site).query(query).then((_: IResult<CwRow>) => {
    return {chemicals: _.recordset}
  });
}

export async function addNonInventoryChemical(itemNmbr: string, itemDesc: string, containerSize: number, units: string): Promise<boolean> {
  const updateQuery = `
  INSERT INTO [IMS].[dbo].[Consumables] (ItemNmbr, ItemDesc, ContainerSize, Units)
  VALUES (@itemNmbr, @itemDesc, @containerSize, @units)`;
  return new sqlRequest().input('itemNmbr', TYPES.VarChar(50), `${itemNmbr}${containerSize}`).input('itemDesc', TYPES.VarChar(101), itemDesc).input('containerSize', TYPES.Numeric(19, 5), containerSize).input('units', TYPES.VarChar(50), units).query(updateQuery).then(() => true);
}

export async function removeNonInventoryChemical(itemNmbr: string): Promise<boolean> {
  if (!itemNmbr) return false;
  const deleteQuery1 = `DELETE FROM [IMS].[dbo].[Consumables] WHERE ItemNmbr = @itemNmbr`;
  const deleteQuery2 = `DELETE FROM [IMS].[dbo].[Quantities] WHERE ItemNmbr = @itemNmbr`;
  const deleteQuery3 = `DELETE FROM [IMS].[dbo].[ProductLinks] WHERE ITEMNMBR = @itemNmbr`;
  await new sqlRequest().input('itemNmbr', TYPES.VarChar(50), itemNmbr).query(deleteQuery3).then(() => true);
  await new sqlRequest().input('itemNmbr', TYPES.VarChar(50), itemNmbr).query(deleteQuery2).then(() => true);
  await new sqlRequest().input('itemNmbr', TYPES.VarChar(50), itemNmbr).query(deleteQuery1).then(() => true);
  return true;
}

export async function updateNonInventoryChemicalQuantity(itemNmbr: string, quantity: number, branch: string): Promise<boolean> {
  const entryExists = await new sqlRequest().input('itemNmbr', TYPES.VarChar(50), itemNmbr).input('branch', TYPES.VarChar(31), branch).query(
    'SELECT Quantity FROM [IMS].[dbo].[Quantities] WHERE ItemNmbr = @itemNmbr AND Site = @branch'
  ).then((_: IResult<gpRes>) => _.recordset.length) === 0;

  const updateQuery = entryExists ?
    `INSERT INTO [IMS].[dbo].[Quantities] (ItemNmbr, Site, Quantity) VALUES (@itemNmbr, @site, @quantity)` :
    `UPDATE [IMS].[dbo].[Quantities] SET Quantity = @quantity WHERE ItemNmbr = @itemNmbr AND Site = @Site`;

  return new sqlRequest().input('itemNmbr', TYPES.VarChar(50), itemNmbr).input('site', TYPES.Char(11), branch).input('quantity', TYPES.Int, quantity).query(updateQuery).then(async () => {
    const totalQuantity = await new sqlRequest().input('itemNmbr', TYPES.VarChar(50), itemNmbr).query(
      `SELECT Quantity FROM [IMS].[dbo].[Quantities] WHERE ItemNmbr = @itemNmbr AND Site <> ''`
    ).then((_: IResult<{Quantity: number}[]>) => _.recordset.reduce((acc, cur) => acc += cur.Quantity, 0));
    const totalResCount = await new sqlRequest().input('itemNmbr', TYPES.VarChar(50), itemNmbr).query(
      `SELECT Quantity FROM [IMS].[dbo].[Quantities] WHERE ItemNmbr = @itemNmbr AND Site = ''`
    ).then((_: IResult<gpRes>) => _.recordset.length);
    const updateTotalQuery = totalResCount === 0 ?
      `INSERT INTO [IMS].[dbo].[Quantities] (ItemNmbr, Site, Quantity) VALUES (@itemNmbr, '', @quantity)` :
      `UPDATE [IMS].[dbo].[Quantities] SET Quantity = @quantity WHERE ItemNmbr = @itemNmbr AND Site = ''`;
    return new sqlRequest().input('itemNmbr', TYPES.VarChar(50), itemNmbr).input('quantity', TYPES.Int, totalQuantity).query(updateTotalQuery);
  }).then(() => true);
}

export async function updateSDS(cwChemicals: Array<CwRow>) {
  const currentChemicals = await new sqlRequest()
    .query('SELECT CwNo, ExtractionDate, DocNo FROM [IMS].[dbo].[Materials]')
    .then(_ => _.recordset as IRecordSet<{CwNo: string, DocNo: string, ItemNmbr: string}>);
  const missingChemicals = cwChemicals.filter(m => !currentChemicals.find(_ => _.CwNo === m.CwNo)).map(c => {
    const query = `INSERT INTO [IMS].[dbo].[Materials] (CwNo) VALUES (@cwNo)`;
    return new sqlRequest().input('cwNo', TYPES.VarChar(50), c.CwNo).query(query);
  });

  const removedChemicals = currentChemicals.filter(c => !cwChemicals.find(_ => _.CwNo === c.CwNo)).map(m => {
    const query = `UPDATE [IMS].[dbo].[Materials] SET OnChemwatch = 0 WHERE CwNo = @cwNo`;
    return new sqlRequest().input('cwNo', TYPES.VarChar(50), m.CwNo).query(query);
  });

  const allChemicals = cwChemicals.map(c => {
    const request = new sqlRequest();
    const sets = [];
    const parameters = [
      {name: 'CwNo', type: TYPES.VarChar(50)},
      {name: 'Name', type: TYPES.VarChar(MAX)},
      {name: 'VendorName', type: TYPES.VarChar(MAX)},
      {name: 'HazardRating', type: TYPES.SmallInt},
      {name: 'HCodes', type: TYPES.VarChar(MAX)},
      {name: 'Pkg', type: TYPES.VarChar(50)},
      {name: 'Dgc', type: TYPES.VarChar(50)},
      {name: 'Un', type: TYPES.VarChar(50)},
      {name: 'DocNo', type: TYPES.VarChar(50)},
      {name: 'Language', type: TYPES.VarChar(50)},
      {name: 'Country', type: TYPES.VarChar(50)}
    ];

    parameters.forEach(_ => {
      request.input(_.name, _.type, c[_.name]);
      sets.push(`${_.name} = @${_.name}`);
    });

    sets.push('OnChemwatch = 1');
    if (c.IssueDate.toISOString() !== '0000-12-31T13:47:52.000Z') sets.push('IssueDate = @issueDate');
    if (c.IssueDate.toISOString() !== '0000-12-31T13:47:52.000Z') request.input('issueDate', TYPES.Date, c.IssueDate);
    if (c.ExtractionDate.toISOString() !== '0000-12-31T13:47:52.000Z') sets.push('ExtractionDate = @extractionDate');
    if (c.ExtractionDate.toISOString() !== '0000-12-31T13:47:52.000Z') request.input('extractionDate', TYPES.Date, c.ExtractionDate);
    const query = `UPDATE [IMS].[dbo].[Materials] SET ${sets.join(', ')} WHERE CwNo = @cwNo`;
    return request.query(query);
  });

   const updatedChemicals = cwChemicals.filter(m => currentChemicals.find(c => c.CwNo === m.CwNo)?.DocNo !== m.DocNo).map(
    cwData => aquirePdfForCwNo(cwData.CwNo)
  );

  await Promise.all(updatedChemicals);
  await Promise.all(missingChemicals);
  await Promise.all(removedChemicals);
  await Promise.all(allChemicals);
  return 1;
}

async function aquirePdfForCwNo(cwNo: string): Promise<Buffer> {
  const getQuery = `
  SELECT a.DocNo, RTRIM(ITEMNMBR) ItemNmbr FROM [IMS].[dbo].[Materials] a
  LEFT JOIN [IMS].[dbo].[ProductLinks] b ON a.CwNo = b.CwNo
  WHERE a.CwNo = @cwNo
  `;
  const entries = await new sqlRequest().input('cwNo', TYPES.VarChar(31), cwNo).query(getQuery)
    .then((_: IResult<{ItemNmbr: string, DocNo: string}[]>) => _.recordset);
  const docNo = entries[0].DocNo;
  const cw = await initChemwatch().catch(e => {
    throw e;
  });
  const fileBuffer = await cw.fileInstance.get<ArrayBuffer>(`document?fileName=pd${docNo}.pdf`).catch((e: {request: {path: string}, response: {statusText: string, path: string}}) => {
    console.error(Error(e.response.statusText));
    return null;
  });
  if (fileBuffer) {
    const buffer = Buffer.from(fileBuffer.data);
    entries.map(_ => _.ItemNmbr).filter(_ => _).forEach(_ => fs.writeFileSync(`pdfs/gp/${_}.pdf`, buffer));
    fs.writeFileSync(`pdfs/pd${docNo}.pdf`, buffer);
    return buffer;
  } else {
    return cw.jsonInstance.get<{Rows: Array<{DocNo: string, ExternalUrl: string}>}>(`json/documents?CwNo=${cwNo}&countryIds=82&languageIds=340700&pagesize=100`).then(_ => {
      const externalUrl = _.data.Rows.find(d => d.DocNo === docNo)?.ExternalUrl;
      return getChemwatchSds(externalUrl || '').then(_ => Buffer.from(_));
    })
  };
}

export async function getSdsPdf(docNo: string, cwNo: string): Promise<Buffer> {
  if (!docNo) throw new Error;
  return await fileExists(`pdfs/pd${docNo}.pdf`) ? fs.readFileSync(`pdfs/pd${docNo}.pdf`) : aquirePdfForCwNo(cwNo);
}

async function copyPdfToItem(itemNmbr: string): Promise<void> {
  const chemical = await getBasicChemicalInfo(itemNmbr);
  return await fileExists(`pdfs/pd${chemical.docNo}.pdf`) ?
    fs.copyFileSync(`pdfs/pd${chemical.docNo}.pdf`, `pdfs/gp/${itemNmbr}.pdf`) :
    aquirePdfForCwNo(chemical.cwNo).then(() => undefined)
}

async function removePdfFromItem(itemNmbr: string): Promise<void> {
  if(await fileExists(`pdfs/gp/${itemNmbr}.pdf`)) fs.rmSync(`pdfs/gp/${itemNmbr}.pdf`);
}

export async function getMaterialsInFolder(page = 1): Promise<CwFolder> {
  const cw = await initChemwatch();
  return cw.jsonInstance.get<CwFolder>(`json/materialsInFolder?folderId=${cwFolderId}&page=${page}&pageSize=250`).then(
    async res => {
      const rows = res.data.Rows;
      rows.map(row => {
        row['IssueDate'] = new Date(row['IssueDate']);
        row['ExtractionDate'] = new Date(row['ExtractionDate']);
        return row;
      })
      const nextPage = res.data.PageNumber < res.data.PageCount ? (await getMaterialsInFolder(res.data.PageNumber + 1)).Rows : [];
      res.data.Rows = [...rows, ...nextPage];
      return res.data;
    }
  );
}