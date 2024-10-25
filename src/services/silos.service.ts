import { IResult, Request as sqlRequest } from 'mssql';

interface Silo {
  SiloID: number;
  MaterialName: string;
  SiteName: string;
  qty: number;
  logtime: Date;
}

export async function getSilos(): Promise<Silo[] | undefined> {
  const getQuery = `
WITH ranked_silos AS (
  SELECT m.*, ROW_NUMBER() OVER (PARTITION BY [SiloID] ORDER BY [LogTimestamp] DESC) AS rn
  FROM [MATTEC].[Silos].[dbo].[SiloValLog] AS m
)
SELECT SiloID, s.SiloNum as SiloName, DecValue AS qty, PLC_Logtime as logtime, m.MatDesc as MaterialName, d.SiteDesc as SiteName
FROM ranked_silos a
LEFT JOIN [MATTEC].[Silos].[dbo].[SiloMatl] m ON m.ID = a.SiloID
LEFT JOIN [MATTEC].[Silos].[dbo].[SiloCon] s ON s.ID = a.SiloID
LEFT JOIN [MATTEC].[Silos].[dbo].[SiteCon] d ON d.SiteID = s.SiteID
WHERE a.rn = 1
`;
  const silos: Silo[] = await new sqlRequest().query(getQuery).then((_: IResult<Silo[]>) => _.recordset) || [];
  return silos;
}