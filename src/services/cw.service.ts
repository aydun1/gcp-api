import axios, { AxiosInstance } from 'axios';
import { cwConfig } from '../config';

interface CwRes {
  Code: number;
  Message: string;
}

const baseURL = 'https://jr.chemwatch.net/api/v1';

let cookieValue: string;
let jsonInstance: AxiosInstance;
export let fileInstance: AxiosInstance;
let isLoggedOn = false;

async function getCookie(): Promise<string> {
  const body = {domain: cwConfig.domain, login: cwConfig.username, password: cwConfig.password};
  const res = await axios.post<CwRes>(`${baseURL}/json/auth`, body);
  if (res.data.Code !== 200) throw new Error(res.data.Message);
  return (res.headers['set-cookie'] || [''])[0];
}

export async function initChemwatch(): Promise<{fileInstance: AxiosInstance, jsonInstance: AxiosInstance}> {
  const isCookieValid = new Date(cookieValue?.split(';')[1]?.split('=')[1]) > new Date();
  if (isLoggedOn && isCookieValid) return {fileInstance, jsonInstance};
  cookieValue = isCookieValid ? cookieValue : await getCookie();
  const headers = {'Content-Type': 'application/json', Cookie: cookieValue};
  fileInstance = axios.create({baseURL, headers, responseType: 'arraybuffer'});
  jsonInstance = axios.create({baseURL, headers, responseType: 'json'});
  isLoggedOn = true;
  return {fileInstance, jsonInstance};
}

export async function getChemwatchSds(sdsUrl: string): Promise<ArrayBuffer> {
  const res = axios.get<ArrayBuffer>(sdsUrl, {responseType: 'arraybuffer'}).then(_ => _.data);
  return res;
}