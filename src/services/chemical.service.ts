import fs from 'fs';
import { IRecordSet, IResult, MAX, Request as sqlRequest, TYPES } from 'mssql';
import { gpRes } from '../types/gp-res';
import { CwRow } from '../types/CwRow';
import { CwFolder } from '../types/CwFolder';
import { getChemwatchSds, initChemwatch } from './cw.service';
import { parseBranch } from './helper.service';

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
const cwFolderId = '4006663';

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