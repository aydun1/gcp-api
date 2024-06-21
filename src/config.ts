import dotenv from 'dotenv';

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
};

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

export const palletKeyHash = process.env.PALLET_KEY_BCRYPT_HASH || '';
export const chemListKeyHash = process.env.CHEMICAL_LIST_BCRYPT_HASH || '';
export const targetDir = process.env.TARGET_DIR || '';