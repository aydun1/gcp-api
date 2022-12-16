import axios, { AxiosError, AxiosInstance } from 'axios';
import { CwRow } from '../CwRow';
import { cwConfig } from '../config';
import fs from 'fs';

const folderId = '4006663';

interface CwRes {
  Code: number;
  Message: string;
}

interface CwSearchResponse {
  PageCount: number;
  RowCount: number;
  PageNumber: number;
  PageSize: number;
  Rows: [{
      Id: number;
      Name: string;
      CwNo: string;
      IsGold: boolean;
      MaterialData: 
        {
          Name: string;
          Value: string;
        }[]
      ;
  }];
}

interface CwFolderRes {
  PageCount: number;
  RowCount: number;
  PageNumber: number;
  PageSize: number;
  Rows: CwRow[]
}

const fileExists = (path: string) => fs.promises.stat(path).then(() => true, () => false);

function parseMaterialData(data: CwSearchResponse): Array<CwRow> {
  return data.Rows.map(row => {
    return {
      Id: row.Id,
      CwNo: row.CwNo,
      Name: row.Name,
      VendorName: row.MaterialData.find(_ => _.Name === 'VENDOR_NAME')?.Value || '',
      Pkg: row.MaterialData.find(_ => _.Name === 'PG')?.Value || '',
      Dgc: row.MaterialData.find(_ => _.Name === 'DGC')?.Value || '',
      IssueDate: new Date(),
      ExtractionDate: new Date()

    }
  })
}

const baseURL = 'https://jr.chemwatch.net/api/v1';

let cookieValue: string;
let jsonInstance: AxiosInstance;
let fileInstance: AxiosInstance;
let isLoggedOn = false;

async function getCookie(): Promise<string> {
  const body = {domain: cwConfig.domain, login: cwConfig.username, password: cwConfig.password};
  const res = await axios.post<{Code: number, Message: string}>(`${baseURL}/json/auth`, body);
  return (res.headers['set-cookie'] || [''])[0];
}

async function initChemwatch(): Promise<void> {
  const isCookieValid = new Date(cookieValue?.split(';')[1]?.split('=')[1]) > new Date();
  if (isLoggedOn && isCookieValid) return;
  cookieValue = isCookieValid ? cookieValue : await getCookie();
  const headers = {'Content-Type': 'application/json', Cookie: cookieValue};
  fileInstance = axios.create({baseURL, headers, responseType: 'arraybuffer'});
  jsonInstance = axios.create({baseURL, headers, responseType: 'json'});
  isLoggedOn = true;
}

export async function getMaterialsInFolder(page = 1): Promise<CwFolderRes> {
  await initChemwatch();
  return jsonInstance.get<CwFolderRes>(`json/materialsInFolder?folderId=${folderId}&page=${page}`).then(
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
    });
}

export async function getMaterial(cwNo: string): Promise<CwRow> {
  await initChemwatch();
  return jsonInstance.get<CwSearchResponse>(`json/materials?cwNo=${cwNo}&own=true`).then(
    res => {
      return parseMaterialData(res.data)[0];
    }
  ).catch((e: AxiosError) => onError(e) as CwRow);
}

export async function getPdf(docNo: string): Promise<Buffer> {
  if (!docNo) throw new Error;
  await initChemwatch();
  const fileName = `pd${docNo}.pdf`;
  return await fileExists(`pdfs/${fileName}`) ? fs.readFileSync(`pdfs/${fileName}`) : await fileInstance.get<ArrayBuffer>(`document?fileName=pd${docNo}.pdf`).then(res => {
    const buffer = Buffer.from(res.data);
    fs.writeFileSync(`pdfs/${fileName}`, buffer);
    return buffer;
  });
}

export async function search(term: string): Promise<CwFolderRes> {
  await initChemwatch();
  return jsonInstance.get<CwSearchResponse>(`json/materials?name=${term}`).then(
    res => {
      const data: CwFolderRes = {...res.data, Rows: parseMaterialData(res.data)}
      return data;
    }
  ).catch((e: AxiosError) => onError(e) as CwFolderRes);
}

function onError(e: AxiosError): unknown {
  if (e.response?.status === 401) cookieValue = '';
  return  e.response?.data;
}