const axios = require('axios')
const fs = require('fs')
const readline = require('readline');
const mssql = require('mssql');
const token = 'a secret';
const headers = {Authorization: `Bearer ${token}`};


const body = {customer: '3Q06563', palletType: 'Cage', palletQty: '0'};

try{
 axios.post('http://localhost:3000/pallets', body, {headers});
} catch(e) {
  console.log('failed')
}

return;

mssql.connect({database: 'gcp', authentication: {options: {userName: 'sa', password: '[P@ssw0rd]'}}, server: 'GPLIVE', options: {trustServerCertificate: true}}).then(() => {
  const rd = readline.createInterface({
    input: fs.createReadStream('C:\\users\\aidan.obrien\\Downloads\\cage_counts.csv'),
    //output: process.stdout,
    console: false
  });

  rd.on('line', async (line) => {
    if (!line.trim().startsWith('customer')) {
      const parts = line.split(',');
      const customer = parts[0].trim();
      const palletQty = parts[1].trim();
      const updateDate = new Date((parseInt(parts[2].trim()) - 25569) * 86400 * 1000).toISOString().slice(0, 10); 
      const body = {customer, palletType: 'Cage', palletQty};
      //try{
      // await axios.post('http://localhost:3000/pallets', body, {headers});
      //} catch(e) {
      //  console.log('failed')
      //}
      //const updateQuery = `
      //UPDATE sy90000 SET PropertyValue = @updateDate
      //WHERE ObjectType = 'Customer' AND ObjectId = @customer AND PropertyName = 'CageLastUpdated'
      //`;
      //return await new mssql.Request().input('updateDate', mssql.TYPES.Char(133), updateDate).input('customer', mssql.TYPES.VarChar(31), customer).query(updateQuery);
    }
  });
});



