import { TYPES, Request as sqlRequest, IResult, VarChar } from 'mssql';
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

export function getPurchaseOrderNumbers(from: string, to: string): Promise<object[]> {
  const request = new sqlRequest();
  let query =
  `
  SELECT rtrim(a.PONUMBER) PONumber,
         rtrim(b.ITEMNMBR) ItemNumber,
         rtrim(c.ITEMDESC) ItemDesc,
         b.QTYORDER OrderQty,
         b.QTYCANCE CancelledQty,
         b.EXTDCOST ExtdCost,
         a.REQDATE Date,
         rtrim(PURCHSTATE) FromSite,
         rtrim(b.LOCNCODE) ToSite,
         b.DEX_ROW_ID Id
  FROM POP10100 a
  INNER JOIN POP10110 b
  ON a.PONUMBER = b.PONUMBER
  INNER JOIN IV00101 c
  ON b.ITEMNMBR = c.ITEMNMBR
  WHERE a.VENDORID in('100241', '164403', '164802', '200001', '200113', '200231', '200387', '300298', '300299', '300310', '300365', '404562', '404631', '404632','404633','404634','502014')
  AND b.QTYCANCE = 0
  AND b.QTYORDER <> 0
  `;
  if (from) query += ' AND a.PURCHSTATE = @from_state';
  if (to) query += ' AND b.LOCNCODE = @to_state';
  query +=' ORDER BY Date DESC';
  console.log(to)
  return request.input('from_state', VarChar(15), from).input('to_state', VarChar(15), to).query(query).then((_: IResult<gpRes>) => _.recordset);
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
  const date = new Date().toLocaleString().replace(',', '').replace('pm', 'PM').replace('am', 'AM')
  const lines = body.lines.map(_ => [date, _.poNumber, body.fromSite, _.itemNumber, _.itemDesc, body.toSite, _.toTransfer, 0, 0]);
  const data = lines.map(_ => _.join(',')).join('\r\n');
  const writeStream = fs.createWriteStream(`${targetDir}/transfer_from_${fromSite}_to_${toSite}.csv`);
  writeStream.write(header.join(','));
  writeStream.write('\r\n');
  writeStream.write(data);
  writeStream.close();
  return writeStream;
}