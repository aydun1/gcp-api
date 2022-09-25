import { TYPES, Request as sqlRequest, IResult, VarChar, SmallInt } from 'mssql';
import fs, { WriteStream } from 'fs';

import { allowedPallets } from '../../config.json';
import { targetDir } from '../config';
import { Transfer } from '../transfer';

const storedProcedure = 'usp_PalletUpdate';

interface gpRes {
  recordsets: Array<object>;
  output: object;
  rowsAffected: Array<number>;
  returnValue: number;
}

export function getPurchaseOrderNumbers(from: string, to: string): Promise<{lines: object[]}> {
  const request = new sqlRequest();
  let query =
  `
  SELECT rtrim(a.PONUMBER) PONumber,
         rtrim(b.ITEMNMBR) ItemNumber,
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
  console.log(to)
  return request.input('from_state', VarChar(15), from).input('to_state', VarChar(15), to).query(query).then((_: IResult<gpRes>) =>  {return {lines: _.recordset}});
}

export function getPurchaseOrder(poNumber: string): Promise<{lines: object[]}> {
  const request = new sqlRequest();
  const query =
  `
  SELECT rtrim(a.ITEMNMBR) ItemNumber,
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

export function getPanList(branch: string) {
  const request = new sqlRequest();
  const query = `
  SELECT a.DEX_ROW_ID Id,
  RTRIM(a.ITEMNMBR) ItemNumber,
  RTRIM(a.ITEMDESC) ItemDesc,
  CAST(f.PalletQty AS int) PalletQty,
  CAST(f.PalletQty / COALESCE(NULLIF(f.PackQty, 0), 1) AS int) PackSize,
  RTRIM(b.LOCNCODE) Location,
  RTRIM(d.BIN) Bin,
  RTRIM(a.USCATVLS_3) Category,
  CAST(b.MNMMORDRQTY AS int) Min,
  CAST(b.MXMMORDRQTY AS int) Max,
  CAST(vic.OnHand AS int) OnHandVIC,
  CAST(e.QLD AS int) OnHandQLD,
  CAST(e.NSW AS int) OnHandNSW,
  CAST(e.SA AS int) OnHandSA,
  CAST(e.WA AS int) OnHandWA,
  CAST(b.QTYONHND AS int) QtyOnHand,
  CAST(b.QTYBKORD AS int) QtyBackordered,
  CAST(b.ATYALLOC AS int) QtyAllocated,
  CAST(COALESCE(m.ATYALLOC, 0) AS int) QtyOnOrderAll,
  CAST(COALESCE(m.week, 0) AS int) QtyOnOrderWeek,
  CAST(COALESCE(m.month, 0) AS int) QtyOnOrderMonth,
  -- b.QTYONHND - b.ATYALLOC QtyAvailable,
  CAST(COALESCE(c.QTYONHND, 0) AS int) InTransit,
  CAST(COALESCE(b.ATYALLOC, 0) + b.QTYBKORD - b.QTYONHND - COALESCE(c.QTYONHND, 0) AS int) QtyRequired
  FROM IV00101 a
  
  -- Get quantities and shiz
  INNER JOIN IV00102 b
  ON a.ITEMNMBR = b.ITEMNMBR
  
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
    SELECT a.[PROD.NO] ITEMNMBR,
    SUM(b.[PAL.TOT.QTY]) OnHand
    FROM [PAPERLESSDW01\\SQLEXPRESS].PWSdw.dbo.STOCK_DW a       
    LEFT JOIN [PAPERLESSDW01\\SQLEXPRESS].[PWSdw].dbo.PALLET_DW b      
    ON a.[PROD.NO] = b.[PROD.NO]
    WHERE a.[PROD.GROUP] NOT IN ('DIES')
    AND b.[PAL.STATUS] = '02'
    GROUP BY a.[PROD.NO]
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
      FOR LOCNCODE IN (NSW, QLD, WA, SA)
    ) Pivot_table
  ) e
  ON a.ITEMNMBR = e.ITEMNMBR

  WHERE b.LOCNCODE = @branch
  AND COALESCE(b.ATYALLOC, 0) + b.QTYBKORD - b.QTYONHND - COALESCE(c.QTYONHND, 0) + b.MXMMORDRQTY > 0
  ORDER BY a.ITEMNMBR ASC
  `;
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

export function getCustomers(branch: string, sort: string, orderby: string, page: number): Promise<{customers: object[]}> {
  const request = new sqlRequest();
  const offset = (page - 1) * 50;
  const order = sort === 'asc' ? 'ASC' : 'DESC';
  let query =
  `
  SELECT rtrim(a.CUSTNMBR) custNmbr, rtrim(a.CUSTNAME) custName, COALESCE(USERDEF2, 0) loscam, COALESCE(USERDEF1, 0) chep, COALESCE(b.plains, 0) plain
  FROM RM00101 a
  LEFT JOIN (
    SELECT rtrim(ObjectID) CUSTNMBR, TRY_CAST(PropertyValue AS INT) plains
    FROM SY90000
    WHERE ObjectType = 'Customer'
    AND PropertyName = 'PLAINQty'
    AND PropertyValue != 0
  ) b ON a.CUSTNMBR = b.CUSTNMBR
  WHERE a.SALSTERR = @branch
  `;
  query += ` ORDER BY ${orderby} ${order}`
  query += ' OFFSET @offset ROWS FETCH NEXT 50 ROWS ONLY;'
  return request.input('branch', VarChar(15), branch).input('offset', SmallInt, offset).input('orderby', VarChar(15), orderby).query(query).then((_: IResult<gpRes>) => {return {customers: _.recordset}});
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

export function writeFile(fromSite: string, toSite: string, body: Transfer): WriteStream {
  const header = ['Transfer Date', 'PO Number', 'From Site', 'Item Number', 'Item Desc', 'To Site', 'Order Qty', 'Qty Shipped', 'Cancelled Qty'];
  const date = new Date().toLocaleString('en-AU').replace(',', '');
  const lines = body.lines.map(_ => [date, _.poNumber, body.fromSite, _.itemNumber, _.itemDesc, body.toSite, _.toTransfer, _.toTransfer, 0]);
  const data = lines.map(_ => _.join(',')).join('\r\n');
  const writeStream = fs.createWriteStream(`${targetDir}/transfer_from_${fromSite}_to_${toSite}.csv`);
  writeStream.write(header.join(','));
  writeStream.write('\r\n');
  writeStream.write(data);
  writeStream.close();
  return writeStream;
}