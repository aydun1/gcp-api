import { TYPES, Request as sqlRequest, IResult, VarChar, SmallInt, Date as sqlDate, IRecordSet, MAX } from 'mssql';
import fs from 'fs';

import { allowedPallets } from '../../config.json';
import { targetDir } from '../config';
import { Line } from '../line';
import { InTransitTransferLine } from '../in-transit-transfer-line';
import { InTransitTransfer } from '../in-transit-transfer';
import { CwRow } from '../CwRow';

const storedProcedure = 'usp_PalletUpdate';

interface gpRes {
  recordsets: Array<object>;
  output: object;
  rowsAffected: Array<number>;
  returnValue: number;
}

function parseBranch(branch: string): string {
  return branch === 'VIC' ? 'MAIN' : branch;
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
  FROM SVC00700
  WHERE ORDDOCID = @doc_id
  `;
  return request.input('doc_id', VarChar(15), id).query(query).then((_: IResult<InTransitTransfer>) =>  {return _.recordset[0]});
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
  FROM SVC00700 a
  INNER JOIN SVC00701 b
  ON a.ORDDOCID = b.ORDDOCID
  INNER JOIN IV00101 c
  ON b.ITEMNMBR = c.ITEMNMBR
  LEFT JOIN IV00102 d
  ON b.ITEMNMBR = d.ITEMNMBR AND b.TRNSFLOC = d.LOCNCODE
  LEFT JOIN IV00117 e
  ON b.ITEMNMBR = e.ITEMNMBR AND b.TRNSFLOC = e.LOCNCODE
  WHERE b.TRNSFQTY > 0
  AND b.TRNSFQTY - b.QTYSHPPD > 0
  `;
  if (id) query += ' AND a.ORDDOCID = @doc_id';
  if (from) query += ' AND b.TRNSFLOC = @from_state';
  if (to) query += ' AND b.TRNSTLOC = @to_state';
  query +=' ORDER BY a.ORDRDATE DESC';
  return request.input('doc_id', VarChar(15), id).input('from_state', VarChar(15), from).input('to_state', VarChar(15), to).query(query).then((_: IResult<InTransitTransferLine>) =>  {return {lines: _.recordset}});
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
  FROM POP10100 a
  INNER JOIN POP10110 b
  ON a.PONUMBER = b.PONUMBER
  INNER JOIN IV00101 c
  ON b.ITEMNMBR = c.ITEMNMBR
  LEFT JOIN IV00102 d
  ON b.ITEMNMBR = d.ITEMNMBR AND d.LOCNCODE = @from_state
  WHERE a.VENDORID in('100241', '164403', '164802', '200001', '200113', '200231', '200387', '300298', '300299', '300310', '300365', '404562', '404631', '404632','404633','404634','502014')
  AND b.QTYCANCE < b.QTYORDER
  AND b.QTYORDER <> 0
  `;
  if (from) query += ' AND a.PURCHSTATE = @from_state';
  if (to) query += ' AND b.LOCNCODE = @to_state';
  query +=' ORDER BY Date DESC';
  return request.input('from_state', VarChar(15), from).input('to_state', VarChar(15), to).query(query).then((_: IResult<gpRes>) =>  {return {lines: _.recordset}});
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
  FROM POP10110 a
  INNER JOIN IV00101 b
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
  pw.PalletQuantity PalletQty,
  pw.Height PalletHeight,
  pw.CartonQuantity PackSize,
  RTRIM(b.LOCNCODE) Location,
  RTRIM(d.BIN) Bin,
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
  b.QTYONHND QtyOnHand,
  b.QTYBKORD QtyBackordered,
  b.ATYALLOC QtyAllocated,
  COALESCE(m.ATYALLOC, 0) QtyOnOrderAll,
  COALESCE(m.week, 0) QtyOnOrderWeek,
  COALESCE(m.month, 0) QtyOnOrderMonth,
  COALESCE(c.QTYONHND, 0) InTransit,
  COALESCE(h.IttRemaining, 0) PreTransit,
  b.QTYONHND + COALESCE(c.QTYONHND, 0) + COALESCE(h.IttRemaining, 0) - b.ATYALLOC - b.QTYBKORD QtyAvailable
  FROM IV00101 a

  -- Get quantities and shiz
  INNER JOIN IV00102 b
  ON a.ITEMNMBR = b.ITEMNMBR

  -- Get UofM
  LEFT JOIN IV40201 u
  ON a.UOMSCHDL = u.UOMSCHDL

  -- get ITTs
  LEFT JOIN (
    SELECT ITEMNMBR, TRNSTLOC, SUM(TRNSFQTY) - SUM(QTYSHPPD) IttRemaining
    FROM SVC00701
    GROUP BY ITEMNMBR, TRNSTLOC
  ) h
  ON a.ITEMNMBR = h.ITEMNMBR AND b.LOCNCODE = h.TRNSTLOC

  -- Get in transits
  LEFT JOIN (
    SELECT ITEMNMBR,
    REPLACE(LOCNCODE, 'TRANS', '') lcn,
    QTYONHND
    FROM IV00102
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
    FROM SOP10100 a
    INNER JOIN SOP10200 b
    ON a.SOPNUMBE = b.SOPNUMBE AND a.SOPTYPE = b.SOPTYPE
    WHERE b.SOPTYPE = 2
    GROUP BY b.ITEMNMBR, b.LOCNCODE
  ) m
  ON b.ITEMNMBR = m.ITEMNMBR AND b.LOCNCODE = m.LOCNCODE

  -- Get Vic stock from Paperless
  LEFT JOIN (
    SELECT a.[PROD.NO] ITEMNMBR, SUM([PAL.TOT.QTY]) OnHand, MAX(a.[PROD.HEIGHT]) Height, MAX([PAL.QTY]) PalletQuantity, MAX([CARTON.QTY]) CartonQuantity
    FROM [PAPERLESSDW01\\SQLEXPRESS].PWSdw.dbo.STOCK_DW a       
    LEFT JOIN [PAPERLESSDW01\\SQLEXPRESS].[PWSdw].dbo.PALLET_DW b
    ON a.[PROD.NO] = b.[PROD.NO]
    WHERE b.[PAL.STATUS] = '02'
    GROUP BY a.[PROD.NO]
  ) pw
  ON a.ITEMNMBR COLLATE DATABASE_DEFAULT = pw.ITEMNMBR COLLATE DATABASE_DEFAULT

  -- Get bin allocations
  LEFT JOIN IV00117 d
  ON a.ITEMNMBR = d.ITEMNMBR AND b.LOCNCODE = d.LOCNCODE

  -- Get branch SOHs
  LEFT JOIN (
    SELECT * FROM (
      SELECT ITEMNMBR, LOCNCODE, QTYONHND
      FROM IV00102
      WHERE QTYONHND <> 0
    ) a
    PIVOT (
      SUM(QTYONHND)
      FOR LOCNCODE IN (HEA, NSW, QLD, WA, SA)
    ) Pivot_table
  ) e
  ON a.ITEMNMBR = e.ITEMNMBR

  WHERE b.LOCNCODE = @branch
  `;
  if (itemNumbers && itemNumbers.length > 0) {
    const itemList = itemNumbers.map(_ => `'${_}'`).join(',');
    request.input('items', VarChar, itemList);
    query += ' AND a.ITEMNMBR in (@items)';
  } else if (searchTerm) {
    request.input('item', VarChar(32), `${searchTerm}%`);
    query += ' AND a.ITEMNMBR LIKE @item';
  } else {
    query += ` AND (
      b.ATYALLOC + b.QTYBKORD - b.QTYONHND - COALESCE(c.QTYONHND, 0) - COALESCE(h.IttRemaining, 0) + b.MXMMORDRQTY > 0 OR
      b.ATYALLOC + b.QTYBKORD - b.QTYONHND - COALESCE(c.QTYONHND, 0) - COALESCE(h.IttRemaining, 0) + b.ORDRUPTOLVL > 0
    )`
  }
  query += ' ORDER BY a.ITEMNMBR ASC';
  return request.input('branch', VarChar(15), branch).query(query).then((_: IResult<gpRes>) => {return {lines: _.recordset}});
}

export function cancelLines(lines: Array<Line>): Promise<{lines: object[]}> {
  const poNumbers = Array.from(new Set(lines.map(_ => _.poNumber))).join('\', \'')
  const request = new sqlRequest();
  let query =
  `
  UPDATE POP10110
  SET QTYCANCE = CASE
  `;
  lines.forEach((v, i) => {
    const poRef = `po${i}`;
    const lnRef = `ln${i}`;
    const qtRef = `qt${i}`;

    const toCancel = Math.min(v.orderQty, v.cancelledQty + v.toTransfer)
    query += ` WHEN PONUMBER = @${poRef} AND LineNumber = @${lnRef} THEN @${qtRef}`;
    request.input(poRef, VarChar(17), v.poNumber);
    request.input(lnRef, SmallInt, v.lineNumber);
    request.input(qtRef, SmallInt, toCancel);
  })
  query += ' ELSE QTYCANCE END';
  query += ` WHERE PONUMBER IN ('${poNumbers}')`;
  return request.query(query).then((_: IResult<gpRes>) => {return {lines: _.recordset}});
}

export function getCustomers(branches: Array<string>, sort: string, orderby: string, filters: Array<string>, search: string, page: number): Promise<{customers: gpRes[]}> {
  const request = new sqlRequest();
  const offset = Math.max(0, (page - 1) * 50);
  const order = sort === 'desc' ? 'DESC' : 'ASC';
  let query =
  `
  SELECT rtrim(a.CUSTNMBR) custNmbr, rtrim(a.CUSTNAME) name, COALESCE(USERDEF2, 0) loscam, COALESCE(USERDEF1, 0) chep, COALESCE(b.plain, 0) plain, COALESCE(c.gcp, 0) gcp
  FROM RM00101 a
  LEFT JOIN (
    SELECT rtrim(ObjectID) CUSTNMBR, TRY_CAST(PropertyValue AS INT) plain
    FROM SY90000
    WHERE ObjectType = 'Customer'
    AND PropertyName = 'PLAINQty'
    AND PropertyValue != 0
  ) b ON a.CUSTNMBR = b.CUSTNMBR
  LEFT JOIN (
    SELECT rtrim(ObjectID) CUSTNMBR, TRY_CAST(PropertyValue AS INT) gcp
    FROM SY90000
    WHERE ObjectType = 'Customer'
    AND PropertyName = 'GCPQty'
    AND PropertyValue != 0
  ) c ON a.CUSTNMBR = c.CUSTNMBR
  `;
  const filterConditions = [];
  const palletFilters = [];
  if (branches.length > 0) filterConditions.push(`a.SALSTERR in ('${branches.join('\', \'')}')`);
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
  return request.input('offset', SmallInt, offset).input('orderby', VarChar(15), orderby).query(query).then((_: IResult<gpRes>) => {return {customers: _.recordset}});
}

export function getCustomer(custNmbr: string): Promise<{customer: gpRes}> {
  const request = new sqlRequest();
  const query =
  `
  SELECT rtrim(a.CUSTNMBR) custNmbr, rtrim(a.CUSTNAME) name, COALESCE(USERDEF2, 0) loscam, COALESCE(USERDEF1, 0) chep, COALESCE(b.plain, 0) plain, COALESCE(c.gcp, 0) gcp
  FROM RM00101 a
  LEFT JOIN (
    SELECT rtrim(ObjectID) CUSTNMBR, TRY_CAST(PropertyValue AS INT) plain
    FROM SY90000
    WHERE ObjectType = 'Customer'
    AND PropertyName = 'PLAINQty'
    AND PropertyValue != 0
  ) b ON a.CUSTNMBR = b.CUSTNMBR
  LEFT JOIN (
    SELECT rtrim(ObjectID) CUSTNMBR, TRY_CAST(PropertyValue AS INT) gcp
    FROM SY90000
    WHERE ObjectType = 'Customer'
    AND PropertyName = 'GCPQty'
    AND PropertyValue != 0
  ) c ON a.CUSTNMBR = c.CUSTNMBR
  WHERE a.CUSTNMBR = @custnmbr
  `;
  return request.input('custnmbr', VarChar(15), custNmbr).query(query).then((_: IResult<gpRes>) => {return {customer: _.recordset[0]}});
}

export function getCustomerAddresses(custNmbr: string) {
  const request = new sqlRequest();
  const query =
  `
  SELECT rtrim(ADRSCODE) name, rtrim(CNTCPRSN) contact, rtrim(ADDRESS1) line1, rtrim(ADDRESS2) line2, rtrim(ADDRESS3) line3, rtrim(CITY) city, rtrim(STATE) state, rtrim(ZIP) postcode
  FROM RM00102
  WHERE CUSTNMBR = @custnmbr
  ORDER BY ADRSCODE ASC
  `;
  return request.input('custnmbr', VarChar(15), custNmbr).query(query).then((_: IResult<gpRes>) => {return {addresses: _.recordset}});
}

export function getHistory(branch: string, itemNmbr: string) {
  branch = parseBranch(branch);
  const request = new sqlRequest();
  const query =
  `
  Select TOP(100) a.DOCDATE date, a.SOPTYPE sopType, a.SOPNUMBE sopNmbr, b.ITEMNMBR itemNmbr, a.LOCNCODE, b.QUANTITY quantity, c.CUSTNAME customer
  FROM SOP30200 a
  LEFT JOIN SOP30300 b
  ON a.SOPTYPE = b.SOPTYPE AND b.SOPNUMBE = a.SOPNUMBE
  LEFT JOIN RM00101 c
  ON a.CUSTNMBR = c.CUSTNMBR
  WHERE b.ITEMNMBR = @itemnmbr
  AND a.LOCNCODE = @locnCode
  AND a.SOPTYPE = 3
  ORDER BY a.DOCDATE DESC
  `;
  return request.input('itemnmbr', VarChar(32), itemNmbr).input('locnCode', VarChar(12), branch).query(query).then((_: IResult<gpRes>) => {return {invoices: _.recordset}});
}

export function getOrders(branch: string, itemNmbr: string) {
  branch = parseBranch(branch);
  const request = new sqlRequest();
  const query =
  `
  Select a.DOCDATE date, a.ReqShipDate, a.SOPTYPE sopType, a.SOPNUMBE sopNmbr, b.ITEMNMBR itemNmbr, a.LOCNCODE, b.QUANTITY * b.QTYBSUOM quantity, c.CUSTNAME customer, d.CMMTTEXT notes
  FROM SOP10100 a
  LEFT JOIN SOP10200 b
  ON a.SOPTYPE = b.SOPTYPE AND b.SOPNUMBE = a.SOPNUMBE
  LEFT JOIN RM00101 c
  ON a.CUSTNMBR = c.CUSTNMBR
  LEFT JOIN SOP10106 d
  ON a.SOPTYPE = d.SOPTYPE AND a.SOPNUMBE = d.SOPNUMBE
  WHERE b.ITEMNMBR = @itemnmbr
  AND a.SOPTYPE IN (2, 3, 5)
  AND SOPSTATUS IN (0, 1)
  AND a.LOCNCODE = @locnCode
  ORDER BY a.DOCDATE DESC
  `;
  return request.input('itemnmbr', VarChar(32), itemNmbr).input('locnCode', VarChar(12), branch).query(query).then((_: IResult<gpRes>) => {return {invoices: _.recordset}});
}

export function getChemicals(branch: string, itemNumber: string) {
  branch = parseBranch(branch);
  const request = new sqlRequest();
  let query = 
  `
  SELECT RTRIM(a.ITEMNMBR) ItemNmbr,
  RTRIM(ITEMDESC) ItemDesc,
  b.QTYONHND QtyOnHand,
  rtrim(c.BIN) Bin,
  Pkg packingGroup,
  Dgc class,
  Name, DocNo docNo,
  HazardRating hazardRating,
  HCodes,
  IssueDate, ExtractionDate, VendorName, Country, Language,
  CASE WHEN e.CwNo IS NOT NULL THEN 1 ELSE 0 END as sdsExists
  FROM IV00101 a
  LEFT JOIN IV00102 b ON a.ITEMNMBR = b.ITEMNMBR
  LEFT JOIN IV00117 c ON a.ITEMNMBR = c.ITEMNMBR AND b.LOCNCODE = c.LOCNCODE
  LEFT JOIN [MSDS].dbo.ProductLinks d ON a.ITEMNMBR = d.ITEMNMBR
  LEFT JOIN [MSDS].dbo.Materials e ON d.CwNo = e.CwNo
  LEFT JOIN (SELECT PropertyValue, ObjectID FROM SY90000 WHERE ObjectType = 'ItemCatDesc') f ON a.ITEMNMBR = f.ObjectID
  WHERE a.ITMCLSCD IN ('BASACOTE', 'CHEMICALS', 'FERTILIZERS', 'NUTRICOTE', 'OCP', 'OSMOCOTE', 'SEASOL')
  `;
  if (itemNumber) query += `
  AND a.ITEMNMBR = @itemNumber
  `;
  query += `
  AND b.LOCNCODE = @locnCode
  AND b.QTYONHND > 0
  AND f.PropertyValue != 'Hardware & Accessories'
  ORDER BY a.ITEMNMBR
  `;
  return request.input('locnCode', VarChar(12), branch).input('itemNumber', VarChar(31), itemNumber).query(query).then((_: IResult<CwRow[]>) => {
    _.recordset.map(c => {
      c['hCodes'] = c.HCodes !== '-' ? c.HCodes?.split(',') : [];
      delete c.HCodes;
  })

    return {chemicals: _.recordset}
  });
}

export function getDocNo(itemNumber: string) {
  const request = new sqlRequest();
  const query = 
  `
  SELECT DocNo docNo
  FROM [MSDS].dbo.ProductLinks d
  LEFT JOIN [MSDS].dbo.Materials e ON d.CwNo = e.CwNo
  WHERE d.ITEMNMBR = @itemNumber
  `;
  return request.input('itemNumber', VarChar(31), itemNumber).query(query).then((_: IResult<{docNo: string}[]>) => _.recordset[0] ? _.recordset[0].docNo : '');
}

export function updatePallets(customer: string, palletType: string, palletQty: string): Promise<number> {
  const qty = parseInt(palletQty, 10);
  if (!customer || !palletType || !palletQty === undefined) throw 'Missing info';
  if (customer.length > 15) throw 'Bad request';
  if (!allowedPallets.includes(palletType)) throw 'Bad pallet';
  if (qty > 1000 || palletQty !== qty.toString(10)) throw 'Bad quantity';
  const request = new sqlRequest();
  request.input('Customer', TYPES.Char(15), customer);
  request.input('PalletType', TYPES.Char(15), palletType);
  request.input('Qty', TYPES.Int, qty.toString(10));
  return request.execute(storedProcedure).then(() => 200).catch(
    e => {
      console.log(e);
      return 500;
    }
  );
}

export function writeTransferFile(fromSite: string, toSite: string, body: Array<Line>): void {
  fromSite = parseBranch(fromSite);
  toSite = parseBranch(toSite);
  const header = ['Transfer Date', 'PO Number', 'From Site', 'Item Number', 'Item Desc', 'To Site', 'Order Qty', 'Qty Shipped', 'Cancelled Qty'];
  const date = new Date().toISOString().split('T')[0];
  const lines = body.map(_ => [date, _.poNumber, fromSite, _.itemNumber, _.itemDesc, toSite, _.toTransfer, _.toTransfer, 0].join(','));
  const path = `${targetDir}/Transfers`
  const fileContents = `${header.join(',')}\r\n${lines.join('\r\n')}`;
  fs.writeFileSync(`${path}/transfer_from_${fromSite}_to_${toSite}.csv`, fileContents);
  setTimeout(() => fs.writeFileSync(`${path}/${new Date().getTime()}.txt`, ''), 5000);
}

export function writeInTransitTransferFile(id: string, fromSite: string, toSite: string, body: Array<Line>): void {
  fromSite = parseBranch(fromSite);
  toSite = parseBranch(toSite);
  let i = 0;
  const header = ['Id', 'Seq', 'Transfer Date', 'From Site', 'To Site', 'Item Number', 'Qty Shipped'];
  const date = new Date().toLocaleDateString('fr-CA');
  const lines = body.map(_ => [id, i += 1, date, fromSite, toSite, _.itemNumber, _.toTransfer]).map(_ => _.join(','));
  const path = `${targetDir}/PICKS/ITT Between SITES`
  const fileContents = `${header.join(',')}\r\n${lines.join('\r\n')}`;
  fs.writeFileSync(`${path}/itt_transfer_from_${fromSite}_to_${toSite}.csv`, fileContents);
  setTimeout(() => fs.writeFileSync(`${path}/${new Date().getTime()}.txt`, ''), 5000);
}

export async function linkChemical(itemNmbr: string, cwNo: string): Promise<number> {
  const request = new sqlRequest();
  const query = 'SELECT ITEMNMBR, CwNo FROM [MSDS].dbo.ProductLinks WHERE ITEMNMBR = @itemNmbr';
  const currentCount = await request.input('itemNmbr', VarChar(31), itemNmbr).query(query).then((_: IResult<gpRes>) => _.recordset.length);
  if (currentCount === 0) {
    const query = `INSERT INTO [MSDS].dbo.ProductLinks (ITEMNMBR, CwNo) VALUES (@itemNmbr, @cwNo)`;
    return new sqlRequest().input('itemNmbr', VarChar(31), itemNmbr).input('cwNo', VarChar(50), cwNo).query(query).then(() => 1);
  } else {
    const query = `UPDATE [MSDS].dbo.ProductLinks SET CwNo = @cwNo WHERE ITEMNMBR = @itemNmbr`;
    return new sqlRequest().input('itemNmbr', VarChar(50), itemNmbr).query(query).then(() => 1);
  }
}

export function getSyncedChemicals(): Promise<{chemicals: IRecordSet<CwRow>}> {
  const request = new sqlRequest();
  const query = 'SELECT CwNo, Name FROM [MSDS].dbo.Materials ORDER BY Name ASC';
  return request.query(query).then((_: IResult<CwRow>) => {return {chemicals: _.recordset}});
}

export async function updateSDS(materials: Array<CwRow>) {
  const current = await new sqlRequest().query('SELECT CwNo, ExtractionDate FROM [MSDS].dbo.Materials').then(_ => _.recordset as IRecordSet<{CwNo: string}>);
  const missing = materials.filter(m => !current.find(_ => _.CwNo === m.CwNo)).map(c => {
    const query = `INSERT INTO [MSDS].dbo.Materials (CwNo) VALUES (@cwNo)`;
    return new sqlRequest().input('cwNo', VarChar(50), c.CwNo).query(query);
  });
  await Promise.all(missing);
  const updates = materials.map(c => {
    const request = new sqlRequest();
    const sets = [];
    const parameters = [
      {name: 'CwNo', type: VarChar(50)},
      {name: 'Name', type: VarChar(MAX)},
      {name: 'VendorName', type: VarChar(MAX)},
      {name: 'HazardRating', type: SmallInt},
      {name: 'HCodes', type: VarChar(MAX)},
      {name: 'Pkg', type: VarChar(50)},
      {name: 'Dgc', type: VarChar(50)},
      {name: 'Un', type: VarChar(50)},
      {name: 'DocNo', type: VarChar(50)},
      {name: 'Language', type: VarChar(50)},
      {name: 'Country', type: VarChar(50)},

    ]
    parameters.forEach(_ => {
      request.input(_.name, _.type, c[_.name]);
      sets.push(`${_.name} = @${_.name}`)
    })
    if (c.IssueDate.toISOString() !== '0000-12-31T13:47:52.000Z') sets.push('IssueDate = @issueDate');
    if (c.IssueDate.toISOString() !== '0000-12-31T13:47:52.000Z') request.input('issueDate', sqlDate, c.IssueDate);
    if (c.ExtractionDate.toISOString() !== '0000-12-31T13:47:52.000Z') sets.push('ExtractionDate = @extractionDate');
    if (c.ExtractionDate.toISOString() !== '0000-12-31T13:47:52.000Z') request.input('extractionDate', sqlDate, c.ExtractionDate);
    const query = `UPDATE [MSDS].dbo.Materials SET ${sets.join(', ')} WHERE CwNo = @cwNo`;
    return request.query(query);
  })
  await Promise.all(updates);
  return 1;
}