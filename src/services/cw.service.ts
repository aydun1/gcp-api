import axios, { AxiosError, AxiosInstance } from 'axios';
import { CwRow } from '../CwRow';
import { cwConfig } from '../config';

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

function parseMaterialData(data: CwSearchResponse): Array<CwRow> {
  return data.Rows.map(row => {
    return {
      Id: row.Id,
      CwNo: row.CwNo,
      Name: row.Name,
      VendorName: row.MaterialData.find(_ => _.Name === 'VENDOR_NAME')?.Value || '',
      Pkg: row.MaterialData.find(_ => _.Name === 'PG')?.Value || '',
      Dgc: row.MaterialData.find(_ => _.Name === 'DGC')?.Value || ''
    }
  })
}

const baseURL = 'https://jr.chemwatch.net/api/v1/json';

let cookieValue: string;
let instance: AxiosInstance;
let isLoggedOn = false;

async function getCookie(): Promise<string> {
  const body = {domain: cwConfig.domain, login: cwConfig.username, password: cwConfig.password};
  const res = await axios.post<{Code: number, Message: string}>(`${baseURL}/auth`, body);
  return (res.headers['set-cookie'] || [''])[0];
}

async function initChemwatch(): Promise<void> {
  const isCookieValid = new Date(cookieValue?.split(';')[1]?.split('=')[1]) > new Date();
  if (isLoggedOn && isCookieValid) return;
  cookieValue = isCookieValid ? cookieValue : await getCookie();
  const headers = {'Content-Type': 'application/json', Cookie: cookieValue};
  instance = axios.create({baseURL, headers});
  isLoggedOn = true;
}

export async function getMaterialsInFolder(): Promise<CwFolderRes> {
  await initChemwatch();
  return instance.get<CwFolderRes>(`materialsInFolder?folderId=${folderId}`).then(
    res => res.data
  ).catch((e: AxiosError) => onError(e) as CwFolderRes);
}

export async function getMaterial(cwNo: string): Promise<CwRow> {
  await initChemwatch();
  return instance.get<CwSearchResponse>(`materials?cwNo=${cwNo}&own=true`).then(
    res => {
      return parseMaterialData(res.data)[0];
    }
  ).catch((e: AxiosError) => onError(e) as CwRow);
}

export async function search(term: string): Promise<CwFolderRes> {
  await initChemwatch();
  return instance.get<CwSearchResponse>(`materials?name=${term}`).then(
    res => {
      const data: CwFolderRes = {...res.data, Rows: parseMaterialData(res.data)}
      return data;
    }
  ).catch((e: AxiosError) => onError(e) as CwFolderRes);
}

function onError(e: AxiosError) {
  if (e.response?.status === 401) cookieValue = '';
  return  e.response?.data;
}