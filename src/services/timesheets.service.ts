import axios from 'axios';
import { UUID } from 'crypto';
import { Request as sqlRequest, TYPES } from 'mssql';

import { definitivConfig, rapidConfig } from '../config';
import { companies } from '../definitions';
import { AuthRes } from '../types/auth-res';
import { Inductee } from '../types/inductee';
import { RapidBody } from '../types/rapid-body';
import { DefinitivDepartment } from '../types/definitiv-department';
import { DefinitivEmployee } from '../types/definitiv-employee';
import { DefinitivLocation } from '../types/definitiv-location';
import { DefinitivOrg } from '../types/definitiv-org';
import { DefinitivProject } from '../types/definitiv-projects';
import { DefinitivRole } from '../types/definitiv-role';
import { DefinitivSchedule } from '../types/definitiv-schedule';
import { DefinitivSchedule2 } from '../types/definitiv-schedule2';
import { DefinitivBreak, DefinitivTimeEntry } from '../types/definitiv-time-entry';
import { DefinitivTimesheet } from '../types/definitiv-timesheet';
import { DefinitivBody } from '../types/definitiv-body';

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

async function getSitesRapid(): Promise<any> {
  await getAccessTokenRapid();
  const url = rapidConfig.sendEndpoint + 'Site';
  const headers = {'Content-Type': 'application/json', Authorization: `Bearer ${authRes.access_token}`};
  const res = await axios.get<{collection: Inductee[]}>(url, {headers}).catch(error => {
    console.log('Error getting rapid sites:', error.response.status);
  });
  return res?.data;
}

async function getInducteeRapid(employeeId: string, firstName: string, lastName: string): Promise<Inductee | undefined> {
  console.log(`Checking for existing rapid inductee.`);
  await getAccessTokenRapid();
  const url = rapidConfig.sendEndpoint + 'Inductee/Search';
  const headers = {'Content-Type': 'application/json', Authorization: `Bearer ${authRes.access_token}`};
  const res1 = await axios.post<{collection: Inductee[]}>(url, {employeeId}, {headers}).catch(error => {
    console.log('Error getting rapid inductees:', error.response.status);
  });
  if (res1) return res1.data.collection[0];
  console.log('Could not match by employee ID. Searching by name.');
  const res2 = await axios.post<{collection: Inductee[]}>(url, {}, {headers}).catch(error => {
    console.log('Error getting rapid inductees:', error.response.status);
  });
  console.log('Could not match by name either.');
  return res2?.data.collection.find(_ => _.firstName === firstName && _.lastName === lastName);
}

async function createInducteeRapid(firstName: string, lastName: string, email: string, employeeId: string): Promise<Inductee | undefined> {
  console.log('Creating inductee in Rapid');
  await getAccessTokenRapid();
  const url = rapidConfig.sendEndpoint + 'Inductee/Create';
  const body: Partial<Inductee> = {
    userType: 0,
    personnelTypeId: 637938,
    siteIds: [206543],
    firstName,
    lastName,
    email,
    employeeId
  };
  const headers = {'Content-Type': 'application/json', Authorization: `Bearer ${authRes.access_token}`};
  const res = await axios.post<Inductee>(url, body, {headers}).catch(error => {
    console.log(error.response.data);
  });
  console.log(res?.data);
  return res?.data;
}

async function updateInducteeRapid(id: number, payload: Partial<Inductee>): Promise<string | undefined> {
  console.log('Updating inductee in Rapid');
  await getAccessTokenRapid();
  const url = `${rapidConfig.sendEndpoint}Inductee/${id}`;
  const headers = {'Content-Type': 'application/json', Authorization: `Bearer ${authRes.access_token}`};
  const res = await axios.put<string>(url, payload, {headers}).catch(error => {
    console.log('Error updating inductee.', error.response.status);
  });
  console.log(res?.data);
  return res?.data;
}

async function getOrgsDefinitiv(): Promise<DefinitivOrg | undefined> {
  const url = `${definitivConfig.endpoint}/api/admin/organizations`;
  try {
    const res = await axios.get<DefinitivOrg>(url, {headers: definitivHeaders});
    console.log(res.data)
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    return undefined;
  }
}

async function getWorkSchedules(employeeId: UUID): Promise<DefinitivSchedule[] | undefined> {
  const url = `${definitivConfig.endpoint}/api/employee/${employeeId}/work-schedules`;
  try {
    const res = await axios.get<DefinitivSchedule[]>(url, {headers: definitivHeaders});
    return res.data;
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    return undefined;
  }
}

async function getWorkScheduleById(orgId: UUID, workScheduleId: UUID): Promise<DefinitivSchedule2 | undefined> {
  const url = `${definitivConfig.endpoint}/api/admin/company/${orgId}/work-schedules/${workScheduleId}`;
  try {
    const res = await axios.get<DefinitivSchedule2>(url, {headers: definitivHeaders});
    return res.data;
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    return undefined;
  }
}

async function getEmployeeRoles(employeeId: UUID): Promise<DefinitivRole[] | undefined> {
  const url = `${definitivConfig.endpoint}/api/employee/${employeeId}/roles`;
  try {
    const res = await axios.get<DefinitivRole[]>(url, {headers: definitivHeaders});
    return res.data;
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    return undefined;
  }
}

async function getEmployeeDepartments(employeeId: UUID): Promise<DefinitivDepartment[] | undefined> {
  const url = `${definitivConfig.endpoint}/api/employee/${employeeId}/departments`;
  try {
    const res = await axios.get<DefinitivDepartment[]>(url, {headers: definitivHeaders});
    return res.data;
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    return undefined;
  }
}

async function getEmployeeLocations(employeeId: UUID): Promise<DefinitivLocation[] | undefined> {
  const url = `${definitivConfig.endpoint}/api/employee/${employeeId}/locations`;
  try {
    const res = await axios.get<DefinitivLocation[]>(url, {headers: definitivHeaders});
    return res.data;
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    return undefined;
  }
}

async function getEmployeeProjects(employeeId: UUID): Promise<DefinitivProject[] | undefined> {
  const url = `${definitivConfig.endpoint}/api/employee/${employeeId}/projects`;
  try {
    const res = await axios.get<DefinitivProject[]>(url, {headers: definitivHeaders});
    return res.data;
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    return undefined;
  }
}

async function getEmployeesDefinitiv(orgId: UUID): Promise<DefinitivEmployee[]> {
  const url = `${definitivConfig.endpoint}/api/organisation/${orgId}/employees/team-employees`;
  try {
    const res = await axios.get<DefinitivEmployee[]>(url, {headers: definitivHeaders});
    return res.data;
  } catch (error: any) {
    error.response ? console.log(error.response.status, error.response.statusText) : console.log(error);
    return error;
  }
}

async function getEmployeeDefinitiv(employeeName: string, orgId: UUID): Promise<DefinitivEmployee | undefined>{
  return getEmployeesDefinitiv(orgId).then(_ => _.find(_ => _.name === employeeName));
}

async function createEmployeeDefinitiv(): Promise<void> {
  const url = `${definitivConfig.endpoint}/api/employees`;
  const body = {
  };
  try {
    const a = await axios.post<{data: any}>(url, body, {headers: definitivHeaders});
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
  if (start) searchParams['start'] = start.toLocaleDateString('en-CA');
  if (end) searchParams['end'] = end.toLocaleDateString('en-CA');
  const queryString = Object.keys(searchParams).map(_ => `${_}=${searchParams[_]}`).join('&');
  const url = `${definitivConfig.endpoint}/api/timesheets?${queryString}`;
  try {
    const res = await axios.get<DefinitivTimesheet[]>(url, {headers: definitivHeaders});
    return res.data;
  } catch (error: any) {
    error.response ? console.log(error.response.status, error.response.statusText) : console.log(error);
    return error;
  }
}

function getAppropriateBreaks(date: string, entryTime: Date, exitTime: Date, timeZone: string, todaysSchedule: DefinitivTimeEntry): DefinitivBreak[] {
  const breaks= [] as Array<DefinitivBreak>;
  if (todaysSchedule.breaks && todaysSchedule.breaks.length > 0) {
    if (todaysSchedule.breaks.length > 1) console.log('More than one break is not handled.');
    const melbourneMidnight = new Date(new Date(new Date(date).toLocaleString('en-US', {timeZone: 'Australia/Melbourne'})).setHours(0,0,0,0));
    const breakStartParts = todaysSchedule.breaks[0].startTimeOfDay.split(':').map(_ => +_);
    const breakStartSeconds = breakStartParts[0] * 3600 + breakStartParts[1] * 60 + breakStartParts[2]
    const breakStartDateTime = new Date(melbourneMidnight.getTime() + breakStartSeconds * 1000);
    const breakEndParts = todaysSchedule.breaks[0].endTimeOfDay.split(':').map(_ => +_);
    const breakEndSeconds = breakEndParts[0] * 3600 + breakEndParts[1] * 60 + breakEndParts[2]
    const breakEndDateTime = new Date(melbourneMidnight.getTime() + breakEndSeconds * 1000);
    if (breakStartDateTime > entryTime && breakEndDateTime < exitTime) {
      breaks.push(todaysSchedule.breaks[0]);
      console.log('Break fits');
    }
  }
  return breaks;
}

async function createTimesheetDefinitiv(employee: DefinitivEmployee, workSchedule: DefinitivSchedule2, rapidBody: RapidBody, departmentId: UUID, locationId: UUID, projectId: UUID, roleId: UUID): Promise<DefinitivTimesheet | undefined> {
  const url = `${definitivConfig.endpoint}/api/timesheets`;
  const entryTime = rapidBody.event.data.entry?.timestamp ? new Date(rapidBody.event.data.entry.timestamp) : undefined;
  if (!entryTime) return;
  const exitTime = rapidBody.event.data.exit?.timestamp ? new Date(rapidBody.event.data.exit?.timestamp) : undefined;
  if (!exitTime) return;
  const date = entryTime?.toLocaleDateString('en-CA');
  if (!date) return;
  const timezone = rapidBody.location.timezone;
  const todaysSchedule = workSchedule?.dailySchedules[0].timeEntries[0];
  const scheduledStartTime = todaysSchedule?.startTimeOfDay;
  const scheduledEndTime = todaysSchedule?.endTimeOfDay;
  const employeeSpecifiedStartTimeOfDay = entryTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const employeeSpecifiedEndTimeOfDay = exitTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const breaks = getAppropriateBreaks(date, entryTime, exitTime, timezone, todaysSchedule);
  const body = {
    employeeId: employee.employeeId,
    projectId,
    roleId,
    departmentId,
    locationId,
    date,
    useTime: true,
    durationHours: null,
    employeeSpecifiedDurationHours: null,
    startTimeOfDay: employeeSpecifiedStartTimeOfDay,
    endTimeOfDay: employeeSpecifiedEndTimeOfDay,
    employeeSpecifiedStartTimeOfDay,
    employeeSpecifiedEndTimeOfDay,
    timePeriodMode: 'StartEndTimes',
    allowEditing: true,
    breaks
  };

  try {
    const res = await axios.post<DefinitivTimesheet>(url, body, {headers: definitivHeaders});
    return res.data;
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    console.log(error.response.data?.errors);
    return;
  }
}

async function updateTimeSheetDefinitiv(timesheet: DefinitivTimesheet, workSchedule: DefinitivSchedule2, rapidBody: RapidBody): Promise<any> {
  const url = `${definitivConfig.endpoint}/api/timesheets`;
  const entryTime = rapidBody.event.data.entry?.timestamp ? new Date(rapidBody.event.data.entry?.timestamp) : undefined;
  if (!entryTime) return;
  const exitTime = rapidBody.event.data.exit?.timestamp ? new Date(rapidBody.event.data.exit?.timestamp) : undefined;
  if (!exitTime) return;
  const date = entryTime?.toLocaleDateString('en-CA');
  if (!date) return;
  const timezone = rapidBody.location.timezone;
  const todaysSchedule = workSchedule?.dailySchedules[0].timeEntries[0];
  const employeeSpecifiedEndTimeOfDay = exitTime?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const breaks = getAppropriateBreaks(date, entryTime, exitTime, timezone, todaysSchedule);
  const body = {
    ...timesheet,
    endTimeOfDay: employeeSpecifiedEndTimeOfDay,
    employeeSpecifiedEndTimeOfDay: employeeSpecifiedEndTimeOfDay,
    breaks
  };
  try {
    const res = await axios.put<DefinitivTimesheet>(`${url}/${timesheet.timesheetId}`, body, {headers: definitivHeaders});
    console.log('Timesheet updated')
    return res.data;
  } catch (error: any) {
    console.log(error.response.status, error.response.statusText);
    console.log(error.response.data?.errors);
    return;
  }
}

async function getTimeSheetToUpdate(orgId: UUID, employeeId: UUID, entryTime: Date, exitTime: Date): Promise<DefinitivTimesheet | undefined> {
  const maxShiftLength = 12;
  const fromTime = new Date(entryTime.getTime() - 1000 * 60 * 60 * 24);
  const previousTimeSheets = await getTimesheetsDefinitiv(orgId, employeeId, fromTime, entryTime);
  const offset = new Date().getTimezoneOffset() * 60 * 1000;
  const timesheetToUpdate = previousTimeSheets.filter(_ => {
    const isoDate = _.date.split('/').reverse().join('-');
    const localDate = new Date(`${isoDate}T${_.startTimeOfDay}Z`);
    const startDate = new Date(localDate.getTime() + offset);
    const hoursBefore = ((exitTime?.getTime() || 0) - startDate.getTime()) / 1000 / 60 / 60;
    return hoursBefore < maxShiftLength;
  })[0];
  return timesheetToUpdate;
}

export async function handleDefinitivEvent(body: DefinitivBody): Promise<any> {
  const latestEvent = body.events[0];
  console.log('Definitiv event received:', latestEvent.eventType);
  const eventName = latestEvent.eventType;
  if (!latestEvent.data.employeeId) Promise.reject({code: 200, message: `There is no employee ID.`});
  const inductee = await getInducteeRapid(latestEvent.data.employeeNumber, latestEvent.data.firstName, latestEvent.data.surname);
  switch (eventName) {
    case 'EmployeeCreated':
    case 'EmployeeModified':
      inductee && inductee.inducteeId ?
      await updateInducteeRapid(inductee.inducteeId, {employeeId: latestEvent.data.employeeNumber}) : 
      await createInducteeRapid(latestEvent.data.firstName, latestEvent.data.surname, latestEvent.data.emailAddresses[0].value, latestEvent.data.employeeNumber);
      break;
    case 'EmployeeDeleted':
      break;
    default:
      return Promise.reject({code: 200, message: `The Definitiv event, ${eventName}, is not supported.`});
  }
}

async function addToLocalDb(employee: DefinitivEmployee, body: RapidBody, checkIn: Date | undefined, checkOut: Date | undefined): Promise<void> {
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
  const orgId = companies.find(_ => body.labels.map(l => l.name).includes(_.name))?.orgId || '';
  if (!orgId) return Promise.reject({code: 200, message: 'Not an employee. Nothing to do.'});
  const employee = await getEmployeeDefinitiv(name, orgId);
  if (!employee) return Promise.reject({code: 200, message: 'Unable to match to an employee in Definitiv.'});
  const workSchedules = await getWorkSchedules(employee.employeeId);
  if (!workSchedules) return Promise.reject({code: 200, message: 'No work schedules for this employee.'});
  const workSchedule = await getWorkScheduleById(employee.organizationId, workSchedules[0].workScheduleId);
  if (!workSchedule) return Promise.reject({code: 200, message: 'Unable to get employee\'s work schedule.'});
  const departments = await getEmployeeDepartments(employee.employeeId);
  const departmentId = departments?.[0]?.departmentId;
  if (!departmentId) return Promise.reject({code: 200, message: 'Unable to get employee\'s department.'});
  const locations = await getEmployeeLocations(employee.employeeId);
  const locationId = locations?.[0]?.locationId;
  if (!locationId) return Promise.reject({code: 200, message: 'Unable to get employee\'s location.'});
  const projects = await getEmployeeProjects(employee.employeeId);
  const projectId = projects?.[0]?.projectId;
  if (!projectId) return Promise.reject({code: 200, message: 'Unable to get employee\'s project.'});
  const roles = await getEmployeeRoles(employee.employeeId);
  const roleId = roles?.[0]?.roleId;
  if (!roleId) return Promise.reject({code: 200, message: 'Unable to get employee\'s role.'});
  const entryTime = body.event.data.entry?.timestamp ? new Date(body.event.data.entry.timestamp) : undefined;
  const exitTime = body.event.data.exit?.timestamp ? new Date(body.event.data.exit?.timestamp) : undefined;
  switch (eventName) {
    case 'CHECKIN_ENTERED':
      console.log('Employee signed in.');
      await addToLocalDb(employee, body, entryTime, exitTime);
      break;
    case 'CHECKIN_EXITED':
      if (!entryTime || !exitTime) return;
      console.log('Employee signed out');
      await addToLocalDb(employee, body, entryTime, exitTime);
      const previousTimeSheet = await getTimeSheetToUpdate(orgId, employee.employeeId, entryTime, exitTime);
      if (previousTimeSheet) {
        await updateTimeSheetDefinitiv(previousTimeSheet, workSchedule, body);
      } else {
        await createTimesheetDefinitiv(employee, workSchedule, body, departmentId, locationId, projectId, roleId);
      }
      break;
    default:
      return Promise.reject({code: 200, message: `The Rapid event, ${eventName}, is not supported.`});
  }
}
