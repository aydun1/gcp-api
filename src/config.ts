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
    trustServerCertificate: true
  }
};

export const webConfig = {
  ip: '0.0.0.0',
  port: process.env.PORT || '3000',
}

export const keyHash = process.env.API_KEY_BCRYPT_HASH || '';