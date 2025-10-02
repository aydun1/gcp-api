import axios from 'axios';
import { Request as sqlRequest, TYPES } from 'mssql';

import { AuthRes } from '../types/auth-res';
import { definitivConfig, rapidConfig } from '../config';
import { Inductee } from '../types/inductee';
import { Employee } from '../types/employee';
import { RapidBody } from '../types/rapid-body';
import { DefinitivOrg } from '../types/definitiv-org';
import { DefinitivTimesheet } from '../types/definitiv-timesheet';
import { DefinitivEmployee } from '../types/definitiv-employee';
import { companies } from '../definitions';
import { UUID } from 'crypto';

let authRes!: AuthRes;
let authDate!: Date;

const definitivHeaders = {
  'Content-Type': 'application/json',
  'Authorization': 'Basic '+ Buffer.from(definitivConfig.apiKey + ':').toString('base64')
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
    const res = await axios.get<{data: DefinitivOrg}>(url, {headers: definitivHeaders});
    console.log(res.data)
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
  }
}

async function getWorkSchedule(employeeId: string) {
  const url = `${definitivConfig.endpoint}/api/employee/${employeeId}/work-schedules`;
  console.log(url);
  try {
    const res = await axios.get<{data: DefinitivOrg}>(url, {headers: definitivHeaders});
    console.log(res.data)
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
  }
}

async function getEmployeeDefinitiv(employeeName: string, orgId: string): Promise<DefinitivEmployee | undefined>{
  return getEmployeesDefinitiv(orgId).then(
    _ => _.find(_ => _.name === employeeName)
  )
}

async function getEmployeesDefinitiv(orgId: string): Promise<DefinitivEmployee[]> {
  console.log('Company Id:', orgId)
  const url =  `${definitivConfig.endpoint}/api/organisation/${orgId}/employees/team-employees`;
  try {
    const res = await axios.get<{data: DefinitivEmployee[]}>(url, {headers: definitivHeaders});
    return res.data as unknown as DefinitivEmployee[];
  } catch (error: any) {
    error.response ? console.log(error.response.status, error.response.statusText) : console.log(error);
    return error;
  }
}

async function createEmployeeDefinitiv(): Promise<void> {
  const url =  `${definitivConfig.endpoint}/api/employees`;
  const body = {
  };
  try {
    const a = await axios.post<{data: any}>(url, {headers: definitivHeaders, body});
    console.log(a.data)
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    return;
  }
}

async function getTimesheetsDefinitiv(orgId: UUID | null, employeeId: UUID | null, start: Date | null, end: Date | null): Promise<DefinitivTimesheet[]> {
  const searchParams: any = {};
  if (orgId) searchParams['orgId'] = orgId;
  if (employeeId) searchParams['employeeId'] = employeeId;
  if (start) searchParams['start'] = start.toISOString();
  if (end) searchParams['end'] = end.toISOString();
  const queryString = Object.keys(searchParams).map(_ => `${_}=${searchParams[_]}`).join('&');

  const url = `${definitivConfig.endpoint}/api/timesheets?${queryString}`;
  console.log(url);
  try {
    const res = await axios.get<DefinitivTimesheet[]>(url, {headers: definitivHeaders});
    console.log(res.data)
    return res.data;
  } catch (error: any) {
    error.response ? console.log(error.response.status, error.response.statusText) : console.log(error);
    return error;
  }
}

async function createTimesheetDefinitiv() {
  const url = `${definitivConfig.endpoint}/api/timesheets`;
  const body = {
    employeeId: 'cb2317f2-8826-4487-b6b5-541208510b19',
    employeeName: 'Denny Nari',
    projectId: '91f27001-95db-4141-8735-8710bab8418f',
    projectName: 'KID',
    roleId: 'b12f3060-504b-4083-9d92-e841edecd0e0',
    roleName: 'Production Operator / Forklift Driver',
    departmentId: 'b72eedd0-e656-41ce-9270-ae5bb2fc3136',
    departmentName: 'KID  Production',
    locationId: '23bd1802-39c9-43d3-89a5-f59f2e65a31b',
    locationName: 'Tasmania',
    date: '2025-09-29',
    useTime: true,
    durationHours: null,
    employeeSpecifiedDurationHours: null,
    startTimeOfDay: '06:00:00',
    employeeSpecifiedStartTimeOfDay: null,
    endTimeOfDay: '15:00:00',
    employeeSpecifiedEndTimeOfDay: null,
    notes: null,
    timePeriodMode: 'StartEndTimes',
    status: 'Approved',
    totalBreakHours: 0.5,
    totalWorkedHours: 8.5,
    allowEditing: true,
    submittedDateTime: '2025-09-29T03:56:20.883Z',
    lastUpdated: '2025-09-29T03:56:20.883Z'
  };
  try {
    const a = await axios.post<{data: any}>(url, {headers: definitivHeaders, body});
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

export async function testEvent(body: RapidBody): Promise<any> {
  //await getEmployeeDefinitiv('', '');
  //await createEmployeeDefinitiv();
  //createTimesheetDefinitiv()
  //const timesheets = await getTimesheetsDefinitiv();
  //getWorkSchedule('cb2317f2-8826-4487-b6b5-541208510b19')
  const dayStart = new Date()
  dayStart.setHours(0,0,0,0);
  const dayEnd = new Date()
  dayEnd.setHours(23,59,59,999);

  console.log(dayStart)
  console.log(dayEnd)

  getTimesheetsDefinitiv(null, 'cb2317f2-8826-4487-b6b5-541208510b19', new Date('2025-07-13'), dayEnd);

  //console.log(timesheets)
}

async function addToLocalDb(employee: DefinitivEmployee, body: RapidBody, checkIn: Date | undefined, checkOut: Date | undefined) {
    const request = new sqlRequest();
    const insertQuery = `
    INSERT INTO [IMS].[dbo].CheckIns (Created,EventId,EventName,EntryTime,ExitTime,EmployeeId,EmployeeName,EmployeeEmail,CompanyId,CompanyName)
    VALUES (@Created,@EventId,@EventName,@EntryTime,@ExitTime,@EmployeeId,@EmployeeName,@EmployeeEmail,@CompanyId,@CompanyName);
    `;
    request.input('Created', TYPES.DateTime, body.event.timestamp);
    request.input('EventId', TYPES.UniqueIdentifier, body.event.id);
    request.input('EventName', TYPES.NChar(20), body.event.topic);
    request.input('EntryTime', TYPES.DateTime, checkIn);
    request.input('ExitTime', TYPES.DateTime, checkOut);
    request.input('EmployeeId', TYPES.UniqueIdentifier, employee.employeeId);
    request.input('EmployeeName', TYPES.NVarChar(255), employee.name);
    request.input('EmployeeEmail', TYPES.NVarChar(255), body.profile.email);
    request.input('CompanyId', TYPES.UniqueIdentifier, employee.organizationId);
    request.input('CompanyName', TYPES.NChar(35), employee.organizationName);
    await request.query(insertQuery);
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
  const entryTime = body.event.data.entry?.timestamp ? new Date(body.event.data.entry.timestamp) : undefined;
  const exitTime = body.event.data.exit?.timestamp ? new Date(body.event.data.exit?.timestamp) : undefined;
  switch (eventName) {
    case 'CHECKIN_ENTERED':
      console.log('Employee signed in.');
      console.log('Entry:', entryTime);
      addToLocalDb(employee, body, entryTime, exitTime);
      break;
    case 'CHECKIN_EXITED':
      console.log('Employee signed out');
      console.log('Entry:', entryTime);
      console.log('Exit:', exitTime);
      addToLocalDb(employee, body, entryTime, exitTime);
      break;
    default:
      return Promise.reject({code: 200, message: `The Rapid event, ${eventName}, is not supported.`});
  }
}
