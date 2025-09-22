import axios from 'axios';

import { AuthRes } from '../types/auth-res';
import { definitivConfig, rapidConfig } from '../config';
import { Inductee } from '../types/inductee';
import { Employee } from '../types/employee';
import { RapidBody } from '../types/rapid-body';
import { DefinitiveOrg } from '../types/definitiv-org';
import { DefinitiveEmployee } from '../types/definitiv-employee';

let authRes!: AuthRes;
let authDate!: Date;

const definitiveHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Basic '+ Buffer.from(definitivConfig.apiKey + ':').toString('base64')
};


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




async function getOrgsDefinitiv() {
  const url = `${definitivConfig.endpoint}/api/admin/organizations`;
  try {
    const res = await axios.get<{data: DefinitiveOrg}>(url, {headers: definitiveHeaders});
    console.log(res.data)
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
  }
}

async function getEmployeeDefinitiv(employeeName: string, orgId: string) {
  const staffMember = (await getEmployeesDefinitiv(orgId)).data.filter(_ => _.name === employeeName);
}

async function getEmployeesDefinitiv(orgId: string): Promise<{data: DefinitiveEmployee[]}> {
  const url =  `${definitivConfig.endpoint}/api/organisation/${orgId}/employees/team-employees`;
  try {
    const res = await axios.get<{data: DefinitiveEmployee[]}>(url, {headers: definitiveHeaders});
    console.log(res.data);
    return res;
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    return error;
  }
}

async function createEmployeeDefinitiv(): Promise<void> {
  const url =  `${definitivConfig.endpoint}/api/employees`;
  const body = {
    organizationId: '735f7d6d-f6b1-4f95-9ede-77cb17264cc9',
    sendInvitationEmail: true,
    title: 'Mr',
    gender: 'Male',
    firstName: 'First',
    middleName: 'Mid',
    surname: 'Lastname',
    preferredName: 'Lasty',
    dateOfBirth: '2001-05-22',
    hireDate: '2023-06-19',
    // payCalendarId: 'bab9438c-1871-45e4-93b1-473fd32daa32',
    // positionId: '18537979-ac3d-a2c8-1744-ce7cd04345a6',
    primaryEmail: 'john.smith2@mailinator.com',
    customFields:
    [
      {name: 'medicalCondition', value:'Asthma'}
    ]
  };
  try {
    const a = await axios.post<{data: any}>(url, {headers: definitiveHeaders, body});
    console.log(a.data)
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    return;
  }
}

async function createTimesheetDefinitiv() {
  const url =  `${definitivConfig.endpoint}/api/timesheets`;
  const body = {
  };
  try {
    const a = await axios.post<{data: any}>(url, {headers: definitiveHeaders, body});
    console.log(a.data)
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    return;
  }
}

export async function handleDefinitivEvent(body: any, eventName: string): Promise<any> {
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

export async function testEvent(): Promise<any> {
  await getEmployeeDefinitiv('', '');
  //await createEmployeeDefinitiv();
}

export async function handleRapidEvent(body: RapidBody): Promise<any> {
  console.log('Rapid event received.');
  const eventName = body.event.topic;
  const email = body.profile.email;
  const name = body.profile.name;
  console.log(body)
  switch (eventName) {
    case 'CHECKIN_ENTERED':
      console.log('Employee signed in.');
      //getEmployeeDefinitiv();
      //TODO - Clock user into Definitiv
      break;
    case 'CHECKIN_EXITED':
      console.log('Employee signed out');
      //TODO - Clock user out of Difinitiv
      break;
    default:
      console.log(`The Rapid event, ${eventName}, is not supported.`);
  }
}
