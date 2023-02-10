import { connect } from 'mssql';
import { compare } from 'bcrypt';
import { BearerStrategy, IBearerStrategyOptionWithRequest, ITokenPayload } from 'passport-azure-ad';
import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';

import { getBasicChemicalInfo, getChemicals, getCustomer, getCustomerAddresses, getCustomers, getCwNoFromItem, getDocNo, getHistory, getInTransitTransfer, getInTransitTransfers, getItems, getMaterialsInFolder, getOrders, getPurchaseOrder, getPurchaseOrderNumbers, getSdsPdf, getSyncedChemicals, linkChemical, unlinkChemical, updatePallets, updateSDS, writeInTransitTransferFile, writeTransferFile } from './services/gp.service';
import { keyHash, sqlConfig, webConfig } from './config';
import config from '../config.json';
import { Transfer } from './types/transfer';

interface Body {
  customer: string;
  palletType: string;
  palletQty: string;
  palletDate: string;
}

const accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' });
const auth = passport.authenticate('oauth-bearer', {session: false}) as RequestHandler;

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
app.use('/enews', express.static('enews'));
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

app.get('/gp', auth, (req: Request, res: Response) => {
  return res.send('');
});

app.get('/gp/customers', auth, (req: Request, res: Response) => {
  const params = req.query;
  const branches = (Array.isArray(params['branch']) ? params['branch'] : [params['branch']].filter(_ => _)) as Array<string>;
  const sort = params['order'] as string || '';
  const order = params['orderby'] as string || '';
  const filters = (Array.isArray(params['filter']) ? params['filter'] : [params['filter']].filter(_ => _)) as Array<string>;
  const search = params['search'] as string || '';
  const page = parseInt(params['page'] as string) || 1;
  getCustomers(branches, sort, order, filters, search, page).then(
    result => res.status(200).send(result)
  ).catch(
    err => {
      console.log(err);
      res.status(500).send(err)
    }
  );
});

app.get('/gp/customers/:id(*)/addresses', auth, (req: Request, res: Response) => {
  getCustomerAddresses(req.params.id).then(
    result => res.status(200).send(result)
  ).catch(
    err => {
      console.log(err);
      res.status(500).send(err)
    }
  );
});

app.get('/gp/customers/:id(*)', auth, (req: Request, res: Response) => {
  getCustomer(req.params.id).then(
    result => res.status(200).send(result)
  ).catch(
    err => {
      console.log(err);
      res.status(500).send(err)
    }
  );
});

app.get('/gp/pan', auth, (req: Request, res: Response) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  getItems(branch, [], '').then(
    result => res.status(200).send(result)
  ).catch(
    err => {
      console.log(err);
      res.status(500).send(err)
    }
  );
});

app.get('/gp/inventory', auth, (req: Request, res: Response) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  const search = params['search'] as string || '';
  getItems(branch, [], search).then(
    result => {
      res.status(200).send(result)
    }
  ).catch(
    err => {
      console.log(err);
      res.status(500).send(err)
    }
  );
});

app.get('/gp/inventory/:id/history', auth, (req: Request, res: Response) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  getHistory(branch, req.params.id).then(
    result => res.status(200).send(result)
  ).catch(
    err => {
      console.log(err);
      res.status(500).send(err)
    }
  );
});

app.get('/gp/inventory/:id/current', auth, (req: Request, res: Response) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  getOrders(branch, req.params.id).then(
    result => res.status(200).send(result)
  ).catch(
    err => {
      console.log(err);
      res.status(500).send(err)
    }
  );
});

app.get('/gp/po', auth, (req: Request, res: Response) => {
  const params = req.query;
  const from = params['from'] as string || '';
  const to = params['to'] as string || '';
  getPurchaseOrderNumbers(from, to).then(
    result => res.status(200).send(result)
  ).catch(
    err => {
      console.log(err);
      res.status(500).send(err)
    }
  );
});

app.post('/gp/po', auth, (req: Request, res: Response) => {
  const body = req.body as Transfer;
  try {
    writeTransferFile(body.fromSite, body.toSite, body.lines);
  } catch(err) {
    res.status(500).send({err});
  }
  res.status(200).send({'status': 'Successfully added PO.'});
});

app.get('/gp/po/:id', auth, (req: Request, res: Response) => {
  getPurchaseOrder(req.params.id).then(
    result => res.status(200).send(result)
  ).catch(
    err => res.status(500).send(err)
  );
});

app.patch('/gp/po/:id', auth, (req: Request, res: Response) => {
  getPurchaseOrder(req.params.id).then(
    result => res.status(200).send(result)
  ).catch(
    err => res.status(500).send(err)
  );
});

app.get('/gp/itt', auth, (req: Request, res: Response) => {
  const params = req.query;
  const from = params['from'] as string || '';
  const to = params['to'] as string || '';
  getInTransitTransfers('', from, to).then(result => 
    res.status(200).send(result)
  ).catch(
    err => res.status(500).send(err)    
  );
});

app.get('/gp/itt/:id', auth, (req: Request, res: Response) => {
  getInTransitTransfer(req.params.id).then(itt =>{
    if (!itt) {
      res.status(404).send({});
      return;
    }
    return getInTransitTransfers(req.params.id, itt.fromSite, '').then(_ => {
      const payload = {..._, orderDate: itt.orderDate, fromSite: itt.fromSite, toSite: itt.toSite, docId: itt.docId };
      res.status(200).send(payload)
    })
  }).catch(err => {res.status(500).send(err)});
});

app.post('/gp/itt', auth, (req: Request, res: Response) => {
  const body = req.body as Transfer;
  try {
    writeInTransitTransferFile(body.id, body.fromSite, body.toSite, body.lines);
  } catch(err) {
    res.status(500).send({err});
  }
  res.status(200).send({'status': 'Successfully added ITT.'});
});

app.post('/pallets', verifyApiKey, (req, res) => {
  const body = req.body as Body;
  updatePallets(body.customer, body.palletType, body.palletQty).then(
    () => res.status(200).json({result: 'Pallet updated successfully.'})
  ).catch((err: {code: number, message: string}) => {
    console.log(err);
    res.status(500).json({'result': err?.message || err})
  });
});

app.get('/gp/chemicals', auth, (req, res) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  const itemNumber = params['itemNmbr'] as string || '';
  const sort = params['order'] as string || '';
  const order = params['orderby'] as string || '';

  getChemicals(branch, itemNumber, sort, order).then(
    _ => res.status(200).json(_)
  ).catch((err: {code: number, message: string}) => {console.log(err)
    res.status(err.code || 500).json({'result': err?.message || err})
});
});

app.get('/gp/saved-materials', auth, (req, res) => {
  getMaterialsInFolder().then(
    _ => res.status(200).json(_)
  ).catch((err: {code: number, message: string}) => 
    res.status(err.code || 500).json({'result': err?.message || err})
  );
});

app.get('/gp/sync-from-cw', auth, (req, res) => {
  getMaterialsInFolder().then(
    _ => {
      return updateSDS(_.Rows);
    }).then(_ => {
      return res.status(200).json(_);
    }).catch((err: {code: number, message: string}) => {
      console.log(err);
      return res.status(err.code || 500).json({'result': err?.message || err});
  });
});

app.get('/gp/synced-materials', auth, (req, res) => {
  getSyncedChemicals().then(_ => res.status(200).json(_)).catch((err: {code: number, message: string}) => {
    console.log(err)
    return res.status(err.code || 500).json({'result': err?.message || err})
  });
});

app.get('/gp/link-material', auth, (req, res) => {
  const params = req.query;
  const itemNmbr = params['itemNmbr'] as string || '';
  const cwNo = params['cwNo'] as string || '';
  linkChemical(itemNmbr, cwNo).then(_ => {
    res.status(200).json(_);
  }).catch((err: {code: number, message: string}) => {
    console.log(err);
    return res.status(err.code || 500).json({'result': err?.message || err})
  });
});

app.get('/gp/unlink-material', auth, (req, res) => {
  const params = req.query;
  const itemNmbr = params['itemNmbr'] as string || '';
  unlinkChemical(itemNmbr).then(_ => {
    res.status(200).json(_);
  }).catch((err: {code: number, message: string}) => {
    console.log(err);
    return res.status(err.code || 500).json({'result': err?.message || err})
  });
});

app.get('/public/sds/:itemNmbr.pdf', (req, res) => {
  const params = req.params;
  const itemNmbr = params['itemNmbr'];
  getBasicChemicalInfo(itemNmbr).then(_ => getSdsPdf(_.docNo, _.cwNo)).then(_ => {
    res.contentType('application/pdf');
    res.status(200).send(_);
  }).catch((err: {code: number, message: string}) => {
    console.log(err);
    return res.status(err.code || 404).send();
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
