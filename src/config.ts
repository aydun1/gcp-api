import dotenv from 'dotenv';
import { config } from 'mssql';

dotenv.config();

export const sqlConfig = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || '',
  authentication: {
    type: 'default',
    options: {
      userName: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD
    }
  },
  options: {
    port: 1433,
    trustServerCertificate: true,
    encrypt: false
  }
} as config;

export const cwConfig = {
  domain: process.env.CW_DOMAIN,
  username: process.env.CW_USERNAME,
  password: process.env.CW_PASSWORD,
}

export const envuConfig = {
  authEndpoint: process.env.ENVU_AUTH_ENDPOINT || '',
  clientId: process.env.ENVU_CLIENT_ID,
  clientSecret: process.env.ENVU_CLIENT_SECRET,
  sendEndpoint: process.env.ENVU_SEND_ENDPOINT || ''
}

export const webConfig = {
  ip: '0.0.0.0',
  port: process.env.PORT || '3000',
}

export const adConfig = {
  credentials: {
    tenantID: '2dcb64e0-c4e4-4c31-af32-9fe0edff2be9',
    clientID: '117fb891-acba-4e2f-b60a-9f95fc0680ff'
  },
  metadata: {
    authority: 'login.microsoftonline.com',
    discovery: '.well-known/openid-configuration',
    version: 'v2.0'
  },
  settings: {
    validateIssuer: true,
    passReqToCallback: false,
    loggingLevel: 'info'
  },
  protectedRoutes: {
    gp: {
      endpoint: '/gp',
      scopes: ['access_as_user']
    }
  }
}

export const palletKeyHash = process.env.PALLET_KEY_BCRYPT_HASH || '';
export const chemListKeyHash = process.env.CHEMICAL_LIST_BCRYPT_HASH || '';
export const targetDir = process.env.TARGET_DIR || '';
export const allowedPallets = ['Loscam', 'Chep', 'GCP', 'Plain', 'Cage'];
