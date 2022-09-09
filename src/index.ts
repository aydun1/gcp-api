import { connect } from 'mssql';
import { compare } from 'bcrypt';
import { BearerStrategy, IBearerStrategyOptionWithRequest, ITokenPayload } from 'passport-azure-ad';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';

import { getPurchaseOrder, getPurchaseOrderNumbers, updatePallets } from './services/gp.service';
import { keyHash, sqlConfig, webConfig } from './config';
import config from '../config.json';

interface Body {
  customer: string;
  palletType: string;
  palletQty: string;
  palletDate: string;
}

const accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' });

const options: IBearerStrategyOptionWithRequest = {
  identityMetadata: `https://${config.metadata.authority}/${config.credentials.tenantID}/${config.metadata.version}/${config.metadata.discovery}`,
  issuer: `https://${config.metadata.authority}/${config.credentials.tenantID}/${config.metadata.version}`,
  clientID: config.credentials.clientID,
  audience: config.credentials.clientID,
  validateIssuer: config.settings.validateIssuer,
  passReqToCallback: false,
  loggingLevel: 'info',
  scope: config.protectedRoutes.gp.scopes
};

const bearerStrategy = new BearerStrategy(options, (token: ITokenPayload, done: CallableFunction) => {
  done(null, {}, token);
});

const app = express();
app.use(express.json());
app.use(helmet());
app.use(morgan('combined', { stream: accessLogStream }));
app.use(passport.initialize());
passport.use(bearerStrategy);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Origin, X-Requested-With, Content-Type, Accept');
  next();
});

function verifyApiKey(req: Request, res: Response, next: NextFunction) {
  const bearerHeader = req.headers['authorization'];
  if (typeof bearerHeader === 'undefined') return res.sendStatus(401);
  const bearerToken = bearerHeader.split(' ')[1];
  compare(bearerToken, keyHash, (err, matched) => {
    if (!matched || err) return res.sendStatus(401);
    next();
  });
}

app.get( '/', ( req, res ) => {
  return res.send('');
});

app.get('/gp', passport.authenticate('oauth-bearer', {session: false}), (req: Request, res: Response) => {
  return res.send('');
});

app.get('/gp/po', passport.authenticate('oauth-bearer', {session: false}), (req: Request, res: Response) => {
  const params = req.query;
  const to = params['to'] as string || '';
  getPurchaseOrderNumbers(to).then(
    result => res.status(200).send(result)
  ).catch(
    err => res.status(500).send(err)
  );
});

app.get('/gp/po/:id', passport.authenticate('oauth-bearer', {session: false}), (req: Request, res: Response) => {
  getPurchaseOrder(req.params.id).then(
    result => res.status(200).send(result)
  ).catch(
    err => res.status(500).send(err)
  );
});

app.post('/pallets', verifyApiKey, (req, res) => {
  const body = req.body as Body;
  updatePallets(body.customer, body.palletType, body.palletQty).then(
    result => res.status(200).json({result})
  ).catch((err: {code: number, message: string}) => 
    res.status(err.code || 500).json({'result': err?.message || err})
  );
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
