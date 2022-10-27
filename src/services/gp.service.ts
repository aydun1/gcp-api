import { TYPES, Request as sqlRequest, IResult, VarChar, SmallInt } from 'mssql';
import fs, { WriteStream } from 'fs';

import { allowedPallets } from '../../config.json';
import { targetDir } from '../config';
import { Transfer } from '../transfer';
import { InTransitTransferLine } from '../in-transit-transfer-line';
import { InTransitTransfer } from '../in-transit-transfer';

const storedProcedure = 'usp_PalletUpdate';

interface gpRes {
  recordsets: Array<object>;
  output: object;
  rowsAffected: Array<number>;
  returnValue: number;
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
  const request = new sqlRequest();
  let query =
  `
  SELECT rtrim(a.ORDDOCID) DocId,
         rtrim(b.ITEMNMBR) ItemNmbr,
         rtrim(c.ITEMDESC) ItemDesc,
         rtrim(d.BINNMBR) Bin,
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
  ON b.ITEMNMBR = d.ITEMNMBR AND d.LOCNCODE = @from_state
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
  const request = new sqlRequest();
  let query = `
  SELECT ${searchTerm ? 'TOP(50)' : ''} a.DEX_ROW_ID Id,
  RTRIM(a.ITEMNMBR) ItemNmbr,
  RTRIM(a.ITEMDESC) ItemDesc,
  f.PalletQty PalletQty,
  vic.Height PalletHeight,
  f.PalletQty / COALESCE(NULLIF(f.PackQty, 0), 1) PackSize,
  RTRIM(b.LOCNCODE) Location,
  RTRIM(d.BIN) Bin,
  RTRIM(b.PRIMVNDR) Vendor,
  RTRIM(a.USCATVLS_3) Category,
  b.ORDRPNTQTY OrderPointQty,
  b.ORDRUPTOLVL OrderUpToLvl,
  b.MNMMORDRQTY MinOrderQty,
  b.MXMMORDRQTY MaxOrderQty,
  vic.OnHand OnHandVIC,
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
  COALESCE(h.TRNSFQTY - h.QTYSHPPD, 0) PreTransit,
  b.QTYONHND + COALESCE(c.QTYONHND, 0) + COALESCE(h.QTYFULFI, 0) - b.ATYALLOC - b.QTYBKORD QtyAvailable,
  b.ATYALLOC + b.QTYBKORD - b.QTYONHND - COALESCE(c.QTYONHND, 0) - COALESCE(h.QTYFULFI, 0) QtyRequired
  FROM IV00101 a
  
  -- Get quantities and shiz
  INNER JOIN IV00102 b
  ON a.ITEMNMBR = b.ITEMNMBR
  
  -- get ITTs
  LEFT JOIN (
    SELECT ITEMNMBR, TRNSTLOC, SUM(QTYFULFI) QTYFULFI, SUM(TRNSFQTY) TRNSFQTY, SUM(QTYSHPPD) QTYSHPPD
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
    SELECT a.[PROD.NO] ITEMNMBR, b.Quantity OnHand, a.[PROD.HEIGHT] Height
    FROM [PAPERLESSDW01\\SQLEXPRESS].PWSdw.dbo.STOCK_DW a       
    LEFT JOIN (
      SELECT [PROD.NO], SUM([PAL.TOT.QTY]) as Quantity
      FROM [PAPERLESSDW01\\SQLEXPRESS].[PWSdw].dbo.PALLET_DW
      WHERE [PAL.STATUS] = '02'
      GROUP BY [PROD.NO]
    ) b      
    ON a.[PROD.NO] = b.[PROD.NO]
  ) vic
  ON a.ITEMNMBR COLLATE DATABASE_DEFAULT = vic.ITEMNMBR COLLATE DATABASE_DEFAULT


  -- Get bin allocations
  LEFT JOIN IV00117 d
  ON a.ITEMNMBR = d.ITEMNMBR AND b.LOCNCODE = d.LOCNCODE


  -- Get item specs
  LEFT JOIN GPLIVE.[labels].dbo.gcp_lbls f
  ON a.ITEMNMBR = f.ItemNumber

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
      b.ATYALLOC + b.QTYBKORD - b.QTYONHND - COALESCE(c.QTYONHND, 0) - COALESCE(h.QTYFULFI, 0) + b.MXMMORDRQTY > 0 OR
      b.ATYALLOC + b.QTYBKORD - b.QTYONHND - COALESCE(c.QTYONHND, 0) - COALESCE(h.QTYFULFI, 0) + b.ORDRUPTOLVL > 0
    )`
  }
  query += ' ORDER BY a.ITEMNMBR ASC';
  return request.input('branch', VarChar(15), branch).query(query).then((_: IResult<gpRes>) => {return {lines: _.recordset}});
}

export function cancelLines(transfer: Transfer): Promise<{lines: object[]}> {
  const poNumbers = Array.from(new Set(transfer.lines.map(_ => _.poNumber))).join('\', \'')
  const request = new sqlRequest();
  let query =
  `
  UPDATE POP10110
  SET QTYCANCE = CASE
  `;
  transfer.lines.forEach((v, i) => {
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
  const offset = (page - 1) * 50;
  const order = sort === 'asc' ? 'ASC' : 'DESC';
  let query =
  `
  SELECT rtrim(a.CUSTNMBR) custNmbr, rtrim(a.CUSTNAME) name, COALESCE(USERDEF2, 0) loscam, COALESCE(USERDEF1, 0) chep, COALESCE(b.plains, 0) plain
  FROM RM00101 a
  LEFT JOIN (
    SELECT rtrim(ObjectID) CUSTNMBR, TRY_CAST(PropertyValue AS INT) plains
    FROM SY90000
    WHERE ObjectType = 'Customer'
    AND PropertyName = 'PLAINQty'
    AND PropertyValue != 0
  ) b ON a.CUSTNMBR = b.CUSTNMBR
  `;
  const filterConditions = [];
  const palletFilters = [];
  if (branches.length > 0) filterConditions.push(`a.SALSTERR in ('${branches.join('\', \'')}')`);
  if (filters.length === 0) filterConditions.push(`a.INACTIVE = 0`);
  if (filters.includes('loscam')) palletFilters.push('USERDEF2 <> 0');
  if (filters.includes('chep')) palletFilters.push('USERDEF1 <> 0');
  if (filters.includes('plain')) palletFilters.push('b.plains <> 0');
  if (search) filterConditions.push(`(a.CUSTNMBR LIKE '${search}%' OR a.CUSTNAME LIKE '%${search}%')`);
  if (palletFilters.length > 0) filterConditions.push(`(${palletFilters.join(' OR ')})`);
  if (filterConditions.length > 0) query += ` WHERE ${filterConditions.join(' AND ')}`;
  query += ` ORDER BY ${orderby.replace('name', 'custName')} ${order}`;
  query += ' OFFSET @offset ROWS FETCH NEXT 50 ROWS ONLY';
  return request.input('offset', SmallInt, offset).input('orderby', VarChar(15), orderby).query(query).then((_: IResult<gpRes>) => {return {customers: _.recordset}});
}

export function getCustomer(custNmbr: string): Promise<{customer: gpRes}> {
  const request = new sqlRequest();
  const query =
  `
  SELECT rtrim(a.CUSTNMBR) custNmbr, rtrim(a.CUSTNAME) name, COALESCE(USERDEF2, 0) loscam, COALESCE(USERDEF1, 0) chep, COALESCE(b.plains, 0) plain
  FROM RM00101 a
  LEFT JOIN (
    SELECT rtrim(ObjectID) CUSTNMBR, TRY_CAST(PropertyValue AS INT) plains
    FROM SY90000
    WHERE ObjectType = 'Customer'
    AND PropertyName = 'PLAINQty'
    AND PropertyValue != 0
  ) b ON a.CUSTNMBR = b.CUSTNMBR
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
  AND a.LOCNCODE = 'QLD'
  AND a.SOPTYPE = 3
  ORDER BY a.DOCDATE DESC
  `;
  return request.input('itemnmbr', VarChar(32), itemNmbr).input('locnCode', VarChar(12), branch).query(query).then((_: IResult<gpRes>) => {return {invoices: _.recordset}});
}

export function getOrders(branch: string, itemNmbr: string) {
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
  AND a.LOCNCODE = 'QLD'
  ORDER BY a.DOCDATE DESC
  `;
  return request.input('itemnmbr', VarChar(32), itemNmbr).input('locnCode', VarChar(12), branch).query(query).then((_: IResult<gpRes>) => {return {invoices: _.recordset}});
}

export function updatePallets(customer: string, palletType: string, palletQty: string) {
  const qty = parseInt(palletQty, 10);
  if (!customer || !palletType || !palletQty === undefined) throw {code: 400, message: 'Missing info'};
  if (customer.length > 15) throw {code: 400, message: 'Bad request'};
  if (!allowedPallets.includes(palletType)) throw {code: 400, message: 'Bad pallet'};
  if (qty > 1000 || palletQty !== qty.toString(10)) throw {code: 400, message: 'Bad quantity'};

  const request = new sqlRequest();
  request.input('Customer', TYPES.Char(15), customer);
  request.input('PalletType', TYPES.Char(15), palletType);
  request.input('Qty', TYPES.Int, qty.toString(10));
  return request.execute(storedProcedure);
}

export function writeTransferFile(fromSite: string, toSite: string, body: Transfer): WriteStream {
  const header = ['Transfer Date', 'PO Number', 'From Site', 'Item Number', 'Item Desc', 'To Site', 'Order Qty', 'Qty Shipped', 'Cancelled Qty'];
  const date = new Date().toISOString().split('T')[0];
  const lines = body.lines.map(_ => [date, _.poNumber, body.fromSite, _.itemNumber, _.itemDesc, body.toSite, _.toTransfer, _.toTransfer, 0]);
  const data = lines.map(_ => _.join(',')).join('\r\n');
  const writeStream = fs.createWriteStream(`${targetDir}/Transfers/transfer_from_${fromSite}_to_${toSite}.csv`);
  writeStream.write(header.join(','));
  writeStream.write('\r\n');
  writeStream.write(data);
  writeStream.close();
  return writeStream;
}

export function writeInTransitTransferFile(id: string, fromSite: string, toSite: string, body: Transfer): WriteStream {
  let i = 0;
  const d = new Date();
  const fileName = `${targetDir}/PICKS/ITT Between SITES/itt_transfer_from_${fromSite}_to_${toSite}.csv`
  const header = ['Id', 'Seq', 'Transfer Date', 'From Site', 'To Site', 'Item Number', 'Qty Shipped'];
  const date = d.toISOString().split('T')[0];
  const lines = body.lines.map(_ => [id, i += 1, date, body.fromSite, body.toSite, _.itemNumber, _.toTransfer]);
  const data = lines.map(_ => _.join(',')).join('\r\n');
  const writeStream = fs.createWriteStream(fileName);
  writeStream.write(header.join(','));
  writeStream.write('\r\n');
  writeStream.write(data);
  writeStream.close();
  return writeStream;
}