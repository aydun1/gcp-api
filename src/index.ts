import { allowedPallets, keyHash, sqlConfig, webConfig } from './config';
import { TYPES, Request, connect } from 'mssql';
import { compare } from 'bcrypt';
import fs from 'fs';
import path from 'path';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

interface Body {
  customer: string,
  palletType: string,
  palletQty: string,
  palletDate: string
}

const storedProcedure = 'usp_PalletUpdate';
const accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' })

const app = express();
app.use(express.json());
app.use(helmet());
app.use(morgan('combined', { stream: accessLogStream }));

app.get( '/', ( req, res ) => {
  return res.send('');
});

app.post('/pallets', (req, res) => {
  const password = req.headers.authorization.replace('Bearer ','');
  compare(password, keyHash).then(auth => {
    if (!auth) return res.status(401).json({'status': 'Not allowed'});
    const body = req.body as Body;
    const customer = body.customer;
    const palletType = body.palletType;
    const palletQty = parseInt(body.palletQty, 10);

    if (!customer || !palletType || !palletQty === undefined) return res.status(400).json({'result': 'Missing info'});
    if (customer.length > 15) return res.status(400).json({'result': 'Bad request'});
    if (!allowedPallets.includes(palletType)) return res.status(400).json({'result': 'Bad pallet'});
    if (palletQty > 1000 || body.palletQty !== palletQty.toString(10)) return res.status(400).json({'result': 'Bad quantity'});


    const request = new Request();

    request.input('Customer', TYPES.Char(15), customer);
    request.input('PalletType', TYPES.Char(15), palletType);
    request.input('Qty', TYPES.Int, palletQty.toString(10));
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
  app.listen(parseInt(webConfig.port, 10), webConfig.ip, () => {
    console.log( `server started at http://localhost:${webConfig.port}` );
  });
});
