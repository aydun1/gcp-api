import axios, { AxiosError, AxiosInstance } from 'axios';
import { cwConfig } from '../config';

interface CwRes {
  Code: number,
  Message: string
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

function onError(e: AxiosError) {
  if (e.response?.status === 401) cookieValue = '';
  return  e.response?.data as CwRes;
}

export async function getMaterialsInFolder(): Promise<CwRes> {
  await initChemwatch();
  return instance.get<CwRes>('materialsInFolder?folderId=4006663&pageSize=100').then(
    _ => _.data
  ).catch((e: AxiosError) => onError(e));
}
