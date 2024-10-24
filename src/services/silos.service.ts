import { IResult, Request as sqlRequest } from 'mssql';

interface Silo {
  SiloID: number;
  qty: number;
  logtime: Date;
}

export async function getSilos(): Promise<Silo[] | undefined> {
  const getQuery = `
WITH ranked_silos AS (
  SELECT m.*, ROW_NUMBER() OVER (PARTITION BY [SiloID] ORDER BY [LogTimestamp] DESC) AS rn
  FROM [Silos].[dbo].[SiloValLog] AS m
)
SELECT SiloID, DecValue AS qty, PLC_Logtime as logtime FROM ranked_silos WHERE rn = 1;
`;
  const silos: Silo[] = await new sqlRequest().query(getQuery).then((_: IResult<Silo[]>) => _.recordset) || [];
  return silos;
}