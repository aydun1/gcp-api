import { allowedPallets, keyHash, sqlConfig, webConfig } from './config';
import { TYPES, Request, connect } from 'mssql';
import { compare } from 'bcrypt';
import express from 'express';
import helmet from 'helmet';

interface Body {
  customer: string,
  palletType: string,
  palletQty: string,
  palletDate: string
}

const storedProcedure = 'usp_PalletUpdate';

const app = express();
app.use(express.json());
app.use(helmet());

app.get( '/', ( req, res ) => {
  return res.send('');
});

app.post('/pallet-api', (req, res) => {
  const password = req.headers.authorization.replace('Bearer ','');
  compare(password, keyHash).then(auth => {
    if (!auth) return res.status(401).json({'status': 'Not allowed'});
    const body = req.body as Body;
    const customer = body.customer;
    const palletType = body.palletType;
    const palletQty = parseInt(body.palletQty, 10);
    const palletDate = body.palletDate;

    if (!customer || !palletType || !palletQty || !palletDate) return res.status(400).json({'result': 'Missing info'});
    if (customer.length > 15) return res.status(400).json({'result': 'Bad request'});
    if (!allowedPallets.includes(palletType)) return res.status(400).json({'result': 'Bad pallet'});
    if (palletQty > 1000 || body.palletQty !== palletQty.toString(10)) return res.status(400).json({'result': 'Bad quantity'});


    const request = new Request();

    // Are these the correct types for the stored procedure?
    request.input('Customer', TYPES.VarChar, customer);
    request.input('PalletType', TYPES.VarChar, palletType);
    request.input('Qty', TYPES.VarChar, palletQty.toString(10));
    request.input('LastUpdate', TYPES.VarChar, palletDate);
    request.execute(storedProcedure, (err, result) => {
      if (err) return res.status(500).json({'result': err});
      return res.json({'result': result});
    });
  });
});

connect(sqlConfig, err => {
  if (err) {
    console.log('Failed to open a SQL Database connection.', err.message);
    process.exit(1);
  }
  app.listen( webConfig.port, () => {
    console.log( `server started at http://localhost:${webConfig.port}` );
  });
});
