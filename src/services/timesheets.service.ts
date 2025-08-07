import axios from 'axios';

import { AuthRes } from '../types/auth-res';
import { rapidConfig } from '../config';
import { Inductee } from '../types/inductee';
import { Employee } from '../types/employee';

let authRes!: AuthRes;
let authDate!: Date;

async function getAccessTokenRapid(): Promise<void> {
  console.log('Getting auth token for Rapid')
  const now = new Date();
  const expires = authRes ? new Date(authDate.getTime() + authRes.expires_in * 1000) : 0;
  if (now < expires) {
    console.log('Already authenticated')
    return Promise.resolve()
  };
  try {
    const grant_type = 'password'
    const headers = {'Content-Type': 'application/json'};
    const body = {username: rapidConfig.username, password: rapidConfig.password, grant_type};
    const res = await axios.post<AuthRes>(rapidConfig.authEndpoint, body, {headers});
    if (res.status !== 200 || res.data.error) throw new Error(res.data.error_description);
    authDate = new Date();
    authRes = res.data;
    console.log('Getting auth token: done')
    return;
  } catch (error: any) {
    throw new Error(error['code'] || error as string);
  }
}

async function getInducteeRapid(employeeId: string): Promise<Inductee | undefined> {
  console.log(`Checking for existing rapid inductee.`);
  await getAccessTokenRapid();
  const url = rapidConfig.sendEndpoint + '/Inductee/Search';
  const body = {employeeId};
  const headers = {'Content-Type': 'application/json', Authorization: `Bearer ${authRes.access_token}`};
  try {
    const res = await axios.post<{collection: Inductee[]}>(url, body, {headers});
    return res.data.collection[0];
  } catch (error: any) {
    console.log('Error getting rapid inductees:', error.response.status)
    return undefined;
  }
}

async function createInducteeRapid(firstName: string, lastName: string, email: string): Promise<void> {
  console.log('Creating inductee in Rapid');
  await getAccessTokenRapid();
  const url = rapidConfig.sendEndpoint + '/Inductee/Create';
  const body: Inductee = {userType: 0, personnelTypeId: 999, siteIds: [0], firstName, lastName, email};
  const headers = {'Content-Type': 'application/json', Authorization: `Bearer ${authRes.access_token}`};
  try {
    await axios.post<{data: any}>(url, body, {headers});
    return;
  } catch (error: any) {
    throw new Error('Error sending data:', error.response.status);
  }
}

async function updateInducteeRapid(id: number, firstName: string, lastName: string, email: string): Promise<void> {
  console.log('Creating inductee in Rapid');
  await getAccessTokenRapid();
  const url = `${rapidConfig.sendEndpoint}/Inductee/${id}`;
  const body: Inductee = {userType: 0, personnelTypeId: 999, siteIds: [0], firstName, lastName, email};
  const headers = {'Content-Type': 'application/json', Authorization: `Bearer ${authRes.access_token}`};
  try {
    await axios.put<{data: any}>(url, body, {headers});
    return;
  } catch (error: any) {
    throw new Error('Error sending data:', error.response.status);
  }
}

export async function handleDefinitiveEvent(body: any, eventName: string): Promise<any> {
  console.log('Definitiv event received.')
  let employee: Employee;
  let inductee: Inductee | undefined;
  switch (eventName) {
    case 'EmployeeCreated':
      console.log('Employee created.');
      employee = body['data'];
      if (!employee.employeeId) return;
      inductee = await getInducteeRapid(employee.employeeId);
      inductee && inductee.inducteeId ?
      await updateInducteeRapid(inductee.inducteeId, employee.firstName, employee.surname, employee.emailAddresses[0].value) : 
      await createInducteeRapid(employee.firstName, employee.surname, employee.emailAddresses[0].value);
      break;
    case 'EmployeeModified':
      console.log('Employee modified');
      employee = body['data'];
      if (!employee.employeeId) return;
      inductee = await getInducteeRapid(employee.employeeId);
      inductee && inductee.inducteeId ?
      await updateInducteeRapid(inductee.inducteeId, employee.firstName, employee.surname, employee.emailAddresses[0].value) : 
      await createInducteeRapid(employee.firstName, employee.surname, employee.emailAddresses[0].value);
      break;
    case 'EmployeeDeleted':
      console.log('Employee deleted');
      // TODO
      break;
    default:
      throw new Error(`The Definitiv event, ${eventName}, is not supported.`);
  }
}

export async function handleRapidEvent(eventName: string): Promise<any> {
  console.log('Rapid event received.')
  switch (eventName) {
    case 'EmployeeSignIn':
      console.log('Employee signed in.');
      break;
    case 'EmployeeSignOut':
      console.log('Employee signed out');
      break;
    default:
      throw new Error(`The Rapid event, ${eventName}, is not supported.`);
  }
}
