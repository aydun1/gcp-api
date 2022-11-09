import { Line } from './line';

export interface Transfer {
  id: string;
  fromSite: string;
  toSite: string;
  lines: Line[]
}