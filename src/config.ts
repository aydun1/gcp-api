export const sqlConfig = {
  server: '127.0.0.1',
  authentication: {
    type: 'default',
    options: {
      userName: 'sa',
      password: 'SQLSERVERPASSWORD'
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

export const keyHash = 'APIKEYBCRYPTHASH';

export const allowedPallets = ['Loscam', 'Chep', 'Plain', 'Cage'];