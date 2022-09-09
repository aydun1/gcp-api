import { TYPES, Request as sqlRequest, IResult, VarChar } from 'mssql';
import { allowedPallets } from '../../config.json';

const storedProcedure = 'usp_PalletUpdate';

interface gpRes {
  recordsets: Array<object>;
  output: object;
  rowsAffected: Array<number>;
  returnValue: number;
}

export function getPurchaseOrderNumbers(to: string): Promise<object[]> {

  const request = new sqlRequest();
  let query =
  `
    SELECT DISTINCT rtrim(a.PONUMBER) PONumber, rtrim(PURCHSTATE) FromSite, rtrim(b.LOCNCODE) ToSite, getdate() TransferDate
    FROM POP10100 a
    INNER JOIN POP10110 b
    ON a.PONUMBER = b.PONUMBER
    WHERE a.VENDORID in('300310','404562','200001','404632','164403','300299','404633','200113','300365','404631','200231','300298','404634','100241','502014','164802','200387')
    AND QTYCANCE = 0
    AND QTYORDER <> 0
  `;
  if (to) query += ' AND b.LOCNCODE = @to_state';
  return request.input('to_state', VarChar(15), to).query(query).then((_: IResult<gpRes>) => _.recordset);
}

export function getPurchaseOrder(poNumber: string): Promise<object[]> {
  const request = new sqlRequest();
  const query =
  `
    SELECT rtrim(PURCHSTATE) FromSite, rtrim(b.ITEMNMBR) ItemNumber, rtrim(c.ITEMDESC) ItemDesc, rtrim(b.LOCNCODE)
    ToSite, b.QTYORDER OrderQty, 0 'QtyShipped',b.QTYCANCE CancelledQty, getdate() TransferDate
    FROM POP10100 a
    INNER JOIN POP10110 b
    ON a.PONUMBER = b.PONUMBER
    INNER JOIN IV00101 c
    ON b.ITEMNMBR = c.ITEMNMBR
    WHERE a.VENDORID in('300310','404562','200001','404632','164403','300299','404633','200113','300365','404631','200231','300298','404634','100241','502014','164802','200387')
    AND QTYCANCE = 0
    AND QTYORDER <> 0
    AND a.PONUMBER = '${poNumber}'
  `;
  return request.query(query).then((_: IResult<gpRes>) => _.recordset);
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