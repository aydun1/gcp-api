import axios from 'axios';

import { allowedPallets } from '../config';

const baseURL = `https://api.businesscentral.dynamics.com/v2.0/DEV-2/api/gcp/ims/v1.0/companies(${process.env.BC_COMPANY})`;

let accessToken = '';
let expiresAt = new Date;

async function authenticate(): Promise<string | void> {
  const username = process.env.BC_CLIENT_ID || '';
  const password = process.env.BC_CLIENT_SECRET || '';
  return axios({
    url: `/${process.env.BC_TENANT}/oauth2/v2.0/token`,
    baseURL: 'https://login.microsoftonline.com/',
    method: 'post',
    auth: {username, password},
    data: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.businesscentral.dynamics.com/.default'
    })
  }).then(_ => {
    accessToken = _.data.access_token;
    expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + _.data.expires_in);
    console.log('Signed in to BC.');
  }).catch(e => {
    console.error('Failed to authenticate with BC.');
    return e;
  })
}

export async function updatePalletsBc(customer: string, palletType: string, palletQty: string): Promise<string> {
  if (expiresAt <= new Date()) await authenticate();
  const headers = {'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`};
  const url = `${baseURL}/customers`;
  const custNmbr = customer.trimEnd();
  const qty = parseInt(palletQty, 10);
  if (!custNmbr || !palletType || !palletQty === undefined) throw new Error('Missing info');
  if (custNmbr.length > 15) throw new Error('Bad request');
  if (!allowedPallets.includes(palletType)) throw new Error('Bad pallet');
  if (qty > 1000 || palletQty !== qty.toString(10)) throw new Error('Bad quantity');
  const getRes = await axios.get<{value: [{id: string}]}>(`${url}?$filter=custNmbr eq '${custNmbr}'`, {headers});
  const custId = getRes.data.value[0]?.id;
  if (!custId) throw new Error('Could not find customer in BC to update.');
  const c = axios.create({baseURL, headers: {...headers, 'If-Match': '*'}});
  await c.patch<any>(`/customers(${custId})`, {[palletType]: qty}).catch(
    e => {
      console.error('BC Failed', custNmbr, palletType, palletQty);
      console.error(e.message);
    }
  );
  console.log('BC', custNmbr, palletType, palletQty);
  return 'Success'
}
