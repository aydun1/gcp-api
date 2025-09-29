import axios from 'axios';
import { Request as sqlRequest, TYPES } from 'mssql';

import { AuthRes } from '../types/auth-res';
import { definitivConfig, rapidConfig } from '../config';
import { Inductee } from '../types/inductee';
import { Employee } from '../types/employee';
import { RapidBody } from '../types/rapid-body';
import { DefinitiveOrg } from '../types/definitiv-org';
import { DefinitiveEmployee } from '../types/definitiv-employee';
import { companies } from '../definitions';

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

async function getEmployeeDefinitiv(employeeName: string, orgId: string): Promise<DefinitiveEmployee | undefined>{
  return getEmployeesDefinitiv(orgId).then(
    _ => _.find(_ => _.name === employeeName)
  )
}

async function getEmployeesDefinitiv(orgId: string): Promise<DefinitiveEmployee[]> {
  console.log('Company Id:', orgId)
  const url =  `${definitivConfig.endpoint}/api/organisation/${orgId}/employees/team-employees`;
  try {
    const res = await axios.get<{data: DefinitiveEmployee[]}>(url, {headers: definitiveHeaders});
    return res.data as unknown as DefinitiveEmployee[];
  } catch (error: any) {
    error.response ? console.log(error.response.status, error.response.statusText) : console.log(error);
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

function addToLocalDb(employee: DefinitiveEmployee, event: RapidBody, checkIn: Date | undefined, checkOut: Date | undefined) {
    const request = new sqlRequest();
    const insertQuery = `
    INSERT INTO [IMS].[dbo].Deliveries (CustomerName,CustomerNumber,City,State,PostCode,Address,CustomerType,ContactPerson,DeliveryDate,OrderNumber,Spaces,Weight,PhoneNumber,Branch,Created,Creator,Notes,RequestedDate,Attachments)
    VALUES (@CustomerName,@CustomerNumber,@City,@State,@PostCode,@Address,@CustomerType,@ContactPerson,@DeliveryDate,@OrderNumber,@Spaces,@Weight,@PhoneNumber,@Branch,@Created,@Creator,@Notes,@RequestedDate,@Attachments);
    `;
    request.input('Created', TYPES.DateTime, new Date());
    request.input('EventId', TYPES.UniqueIdentifier, event.event.id);
    request.input('EventName', TYPES.VarChar(35), event.event.topic);
    request.input('EntryTime', TYPES.DateTime, checkIn);
    request.input('ExitTime', TYPES.DateTime, checkOut);
    request.input('Name', TYPES.VarChar(35), employee.name);
    request.input('Email', TYPES.VarChar(35), event.profile.email);
    request.input('Company', TYPES.VarChar(35), employee.organizationName);
    request.input('CompanyId', TYPES.VarChar(35), employee.organizationId);

}

export async function handleRapidEvent(body: RapidBody): Promise<any> {
  console.log('Rapid event received.');
  if (!body.event) return Promise.reject({code: 200, message: 'Not a Rapid event.'});
  const eventName = body.event.topic;
  const name = body.profile.name;
  const email = body.profile.email;
  if (!email) return Promise.reject({code: 200, message: 'User doesn\'t have an email address.'});
  const orgId = companies.find(_ => _.emailDomain === email.split('@')[1])?.orgId || '';
  if (!orgId) return Promise.reject({code: 200, message: 'Not an employee. Nothing to do.'});
  const employee = await getEmployeeDefinitiv(name, orgId);
  if (!employee) return Promise.reject({code: 200, message: 'Unable to match to an employee in Definitiv.'});
  console.log(employee);
  const entryTime = body.event.data.entry?.timestamp ? new Date(body.event.data.entry.timestamp) : undefined;
  const exitTime = body.event.data.exit?.timestamp ? new Date(body.event.data.exit?.timestamp) : undefined;





  switch (eventName) {
    case 'CHECKIN_ENTERED':
      console.log('Employee signed in.');
      console.log('Entry:', entryTime);
      break;
    case 'CHECKIN_EXITED':
      console.log('Employee signed out');
      console.log('Entry:', entryTime);
      console.log('Exit:', exitTime);
      break;
    default:
      return Promise.reject({code: 200, message: `The Rapid event, ${eventName}, is not supported.`});
  }
}
