import { IResult, Request as sqlRequest, TYPES } from 'mssql';

interface Silo {
  SiloID: number;
  MaterialName: string;
  SiteName: string;
  SuplID: number;
  SuplName: string;
  qty: number;
  logtime: Date;
}

interface Supplier {
  id: number;
  name: string;
}

export async function getSilos(): Promise<Silo[] | undefined> {
  const getQuery = `
WITH ranked_silos AS (
  SELECT m.*, ROW_NUMBER() OVER (PARTITION BY [SiloID] ORDER BY [LogTimestamp] DESC) AS rn
  FROM [MATTEC].[Silos].[dbo].[SiloValLog] AS m
)
SELECT a.rn, SiloID, s.SiloNum as SiloName, v.SuplID, RTRIM(v.SuplName) as SuplName, COALESCE(DecValue, 0) AS qty, PLC_Logtime as logtime, RTRIM(m.MatDesc) as MaterialName, d.SiteDesc as SiteName, COALESCE(o.ReorderLvl, 0) as ReorderLvl, o.ShipmentLvl, COALESCE(o.CriticalLvl, 0) as CriticalLvl, s.Capacity
FROM [MATTEC].[Silos].[dbo].[SiloCon] as s
LEFT JOIN ranked_silos a ON s.ID = a.SiloID
LEFT JOIN [MATTEC].[Silos].[dbo].[SiloMatl] m ON m.ID = a.SiloID
LEFT JOIN [MATTEC].[Silos].[dbo].[OrderCon] o ON o.ID = a.SiloID
LEFT JOIN [MATTEC].[Silos].[dbo].[SiteCon] d ON d.SiteID = s.SiteID
LEFT JOIN [MATTEC].[Silos].[dbo].[MatlSupl] v ON m.SuplID = v.SuplID
WHERE (a.rn = 1 OR a.rn IS NULL)

`;
  const silos: Silo[] = await new sqlRequest().query(getQuery).then((_: IResult<Silo[]>) => _.recordset) || [];
  return silos;
}

export async function getSuppliers(): Promise<Supplier[]> {
  const getQuery = 'SELECT SuplID id, RTRIM(SuplName) name FROM [MATTEC].[Silos].[dbo].[MatlSupl]';
  const request = new sqlRequest()
  return request.query(getQuery).then((_: IResult<Supplier[]>) => _.recordset) || [];
}

async function updateOrderLevels(id: number, reorderLevel: number, shipmentLevel: number, criticalLevel: number): Promise<boolean> {
  const setQuery = `
  UPDATE [MATTEC].[Silos].[dbo].[OrderCon]
  SET ReorderLvl=@reorderLevel,ShipmentLvl=@shipmentLevel,CriticalLvl=@criticalLevel
  WHERE ID = @id;
`;
  const request = new sqlRequest();
  request.input('id', TYPES.Int, id);
  request.input('reorderLevel', TYPES.Decimal(10,2), reorderLevel);
  request.input('shipmentLevel', TYPES.Decimal(10,2), shipmentLevel);
  request.input('criticalLevel', TYPES.Decimal(10,2), criticalLevel);
  await request.query(setQuery);
  return true;
}

async function updateMaterial(id: number, material: string, supplierId: number): Promise<boolean> {
  const setQuery = `
  UPDATE [MATTEC].[Silos].[dbo].[SiloMatl]
  SET MatDesc=@material,SuplID=@supplierId
  WHERE ID = @id;
`;
  const request = new sqlRequest();
  request.input('id', TYPES.Int, id);
  request.input('material', TYPES.Char(30), material);
  request.input('supplierId', TYPES.Int, supplierId);
  await request.query(setQuery);
  return true;
}

export async function updateItem(id: number, reorderLevel: number, shipmentLevel: number, criticalLevel: number, material: string, supplierId: number): Promise<boolean> {
  await updateOrderLevels(id, reorderLevel, shipmentLevel, criticalLevel);
  await updateMaterial(id, material, supplierId);
  return true;
}