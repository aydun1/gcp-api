import { connect } from 'mssql';
import { compare, compareSync } from 'bcrypt';
import { BearerStrategy, IBearerStrategyOptionWithRequest, ITokenPayload } from 'passport-azure-ad';
import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';
import compression = require('compression');

import { getBasicChemicalInfo, getChemicals, getCustomer, getCustomerAddresses, getCustomers, getHistory, getInTransitTransfer, getInTransitTransfers, getItems, getMaterialsInFolder, getOrders, getSdsPdf, getSyncedChemicals, linkChemical, unlinkChemical, updatePallets, updateSDS, writeInTransitTransferFile, getNonInventoryChemicals, addNonInventoryChemical, updateNonInventoryChemicalQuantity, getOrdersByLine, getOrderLines, getVendorAddresses, getVendors, getDeliveries, addDelivery, updateDelivery, removeDelivery, getChemicalsOnRun } from './services/gp.service';
import { chemListKeyHash, palletKeyHash, sqlConfig, webConfig } from './config';
import config from '../config.json';
import { Transfer } from './types/transfer';
import { Delivery } from './types/delivery';
import { sendChemicalSalesToEnvu } from './services/envu.service';

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
  scope: config.protectedRoutes.gp.scopes
};

const bearerStrategy = new BearerStrategy(options, (token: ITokenPayload, done: CallableFunction) => {
  done(null, {}, token);
});

const app = express();
app.use('/enews', express.static('enews'));
app.use('/assets', express.static('assets'));
app.use(express.json());
app.use(helmet());
app.use(morgan('combined', { stream: accessLogStream }));
app.use(passport.initialize());
app.use(compression());
passport.use(bearerStrategy);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Origin, X-Requested-With, Content-Type, Accept');
  next();
});

function handleError(err: any, res: Response) {
  if (err.code === 'ENOCONN') {
    sqlConfig['server'] = '10.30.5.70';
    connect(sqlConfig, err => {
      if (err) console.log('Failed to open a SQL Database connection.', err?.message)
    });
  }
  console.error(err);
  return res.status(500).json({'result': 'Internal server error'});
}

function verifyPalletApiToken(req: Request, res: Response, next: NextFunction) {
  const bearerHeader = req.headers['authorization'];
  if (typeof bearerHeader === 'undefined') return res.sendStatus(401);
  const bearerToken = bearerHeader.split(' ')[1];
  compare(bearerToken, palletKeyHash, (err, matched) => {
    if (!matched || err) return res.sendStatus(401);
    next();
  });
}

function verifyChemicalListToken(req: Request, res: Response, next: NextFunction) {
  const params = req.query;
  const bearerToken = params['key'] as string || '';
  const matched = compareSync(bearerToken, chemListKeyHash);
  if (!matched) return res.sendStatus(401);
  next();
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
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/customers/:id(*)/addresses', auth, (req: Request, res: Response) => {
  getCustomerAddresses(req.params.id).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/customers/:id(*)', auth, (req: Request, res: Response) => {
  getCustomer(req.params.id).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/vendors', auth, (req: Request, res: Response) => {
  const params = req.query;
  const search = params['search'] as string || '';
  const page = parseInt(params['page'] as string) || 1;
  getVendors(search, page).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/vendors/:id(*)/addresses', auth, (req: Request, res: Response) => {
  getVendorAddresses(req.params.id).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/pan', auth, (req: Request, res: Response) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  getItems(branch, [], '').then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/inventory', auth, (req: Request, res: Response) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  const search = params['search'] as string || '';
  getItems(branch, [], search).then(
    result => {
      res.status(200).send(result)
    }
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/inventory/:id/history', auth, (req: Request, res: Response) => {
  getHistory(req.params.id).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/inventory/:id/current', auth, (req: Request, res: Response) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  getOrdersByLine(branch, req.params.id).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/inventory/:id/stock', auth, (req: Request, res: Response) => {
  getItems('', [req.params.id], '').then(
    result => res.status(200).send(result['lines'][0])
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/orders', auth, (req: Request, res: Response) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  const date = params['date'] as string || '';
  getOrders(branch, 'released', date).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/orders/:sopType/:sopNumber', auth, (req: Request, res: Response) => {
  const sopType = +req.params.sopType;
  const sopNumber = req.params.sopNumber;
  getOrderLines(sopType, sopNumber).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/itt', auth, (req: Request, res: Response) => {
  const params = req.query;
  const from = params['from'] as string || '';
  const to = params['to'] as string || '';
  getInTransitTransfers('', from, to).then(result => 
    res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
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
  }).catch(err => {
    return handleError(err, res);
  });
});

app.post('/gp/itt', auth, (req: Request, res: Response) => {
  const body = req.body as Transfer;
  writeInTransitTransferFile(body.id, body.fromSite, body.toSite, body.lines).then(
    _ => res.status(200).send({docId: _, status: 'Successfully added ITT.'})
  ).catch(err => {
    return handleError(err, res);
  });
});

app.post('/pallets', verifyPalletApiToken, (req, res) => {
  const body = req.body as Body;
  updatePallets(body.customer, body.palletType, body.palletQty).then(
    () => res.status(200).json({result: 'Pallet updated successfully.'})
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/deliveries', auth, (req, res) => {
  const body = req.query as {branch: string, run: string, status: string, deliveryType: string, orderNumberQuery: string};
  const archived = body.status === 'Archived' ? true : false;
  const orderNumberQuery = body.orderNumberQuery;
  getDeliveries(body.branch, body.run, body.deliveryType, archived, orderNumberQuery).then(_ => res.status(200).json(_)).catch(err => {
    return handleError(err, res);
  });
});

app.post('/gp/deliveries', auth, (req, res) => {
  const body = req.body as {fields: Delivery};
  addDelivery(body.fields).then(_ => res.status(200).json(_)).catch(err => {
    return handleError(err, res);
  });
});

app.post('/gp/deliveries/batch', auth, (req, res) => {
  const body = req.body as {requests: [{id: number, method: string, body: {fields: Delivery}}]};
  const updates = body.requests.filter(_ => _.method.toUpperCase() === 'PATCH').map(_ => updateDelivery(_.id, _.body.fields));
  const deletes = body.requests.filter(_ => _.method.toUpperCase() === 'DELETE').map(_ => removeDelivery(_.id));
  Promise.all([...updates, ...deletes]).then(_ => {
    res.status(200).json({responses: _})
  }).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/chemicals', auth, (req, res) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  const itemNumber = params['itemNmbr'] as string || '';
  const sort = params['order'] as string || '';
  const order = params['orderby'] as string || '';
  const category = params['category'] as string || '';

  getChemicals(branch, itemNumber, category, sort, order).then(
    _ => res.status(200).json(_)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/saved-materials', auth, (req, res) => {
  getMaterialsInFolder().then(
    _ => res.status(200).json(_)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/sync-from-cw', auth, (req, res) => {
  getMaterialsInFolder().then(_ => {
    return updateSDS(_.Rows);
  }).then(_ => {
    return res.status(200).json(_);
  }).catch((err: {code: number, message: string}) => {
    return handleError(err, res);
  });
});

app.get('/gp/synced-materials', auth, (req, res) => {
  getSyncedChemicals().then(_ => res.status(200).json(_)).catch((err: {code: number, message: string}) => {
    return handleError(err, res);
  });
});

app.get('/gp/non-inventory-chemicals', auth, (req, res) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  getNonInventoryChemicals(branch).then(_ => res.status(200).json(_)).catch((err: {code: number, message: string}) => {
    return handleError(err, res);
  });
});

app.post('/gp/non-inventory-chemicals', auth, (req: Request, res: Response) => {
  const body = req.body as {itemNmbr: string, itemDesc: string, size: number, units: string};
  addNonInventoryChemical(body.itemNmbr, body.itemDesc, body.size, body.units).then(_ => res.status(200).json(_)).catch((err: {code: number, message: string}) => {
    return handleError(err, res);
  });
});

app.post('/gp/non-inventory-chemical-qty', auth, (req: Request, res: Response) => {
  const body = req.body as {itemNmbr: string, quantity: number, branch: string};
  updateNonInventoryChemicalQuantity(body.itemNmbr, body.quantity, body.branch).then(_ => res.status(200).json(_)).catch((err: {code: number, message: string}) => {
    return handleError(err, res);
  });
});

app.get('/gp/link-material', auth, (req, res) => {
  const params = req.query;
  const itemNmbr = params['itemNmbr'] as string || '';
  const cwNo = params['cwNo'] as string || '';
  linkChemical(itemNmbr, cwNo).then(_ => {
    res.status(200).json(_);
  }).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/unlink-material', auth, (req, res) => {
  const params = req.query;
  const itemNmbr = params['itemNmbr'] as string || '';
  unlinkChemical(itemNmbr).then(_ => {
    res.status(200).json(_);
  }).catch(err => {
    return handleError(err, res);
  });
});

app.get('/chemicals/lookup', (req, res) => {
  res.setHeader('Content-Security-Policy', '');
  res.status(200).send(  
    `
    <html>
    <head>
    <title>Garden City SDS Lookup</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="/assets/chemical-lookup.css">
    </head>
    <script>
      function getUrl() {
        const prodNo = document.getElementById('prodNo').value.replace(/[^a-zA-Z0-9]/g, '');
        if (prodNo) window.location.href = '/public/sds/' + prodNo + '.pdf';
        return false;
      }
    </script>
    <body>
    <img src="/assets/gcp_banner.png" alt="Garden City Plastic banner">
    <form onsubmit="return getUrl()">
      <h2>SDS Lookup</h2>
      <div class="text-field">
        <label for="prodNo">Product code</label>
        <input type="text" id="prodNo">
      </div>
      <button type="submit" value="Open SDS">Open SDS</button>
    </form>
    </body>
    </html>
    `
  )
});

app.get('/chemicals/list', verifyChemicalListToken, (req, res) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  getChemicals(branch, '', '', '', 'Name').then(
    chemicals => {
      res.status(200).send(
        '<html><head><title>GCP SDS List</title></head><body><ul><li>' +
        chemicals.chemicals.filter(_ => _.sdsExists)
          .filter((v,i,a)=>a.findIndex(v2=>(v2.DocNo===v.DocNo))===i)
          .map(c => `<a href="/public/sds/${c.ItemNmbr}.pdf" target="_blank">${c.Name || ''}</a>`).join('</li>\n<li>') +
        '</li></ul></body></html>'
      )
    }
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/chemicals/outbound', verifyChemicalListToken, (req,  res) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  const run = params['run'] as string || '';
  const format = params['format'] as string || '';
  getChemicalsOnRun(branch, run).then(
    chemicals => {
      if (format !== 'json') {
        console.log(req.accepts('text/html'))
        res.status(200).send(
          `<html lang="en" translate="no"><head>
          <title>Outbound chemicals</title>
          <meta name="viewport" content="width=device-width, height=device-height, initial-scale=1">
          <meta name="google" content="notranslate">
          <style> td {padding: 10px 0;}</style>
          </head><body><table><tr><th>Qty</th><th>Name</th><th>Class</th><tr>` +
          chemicals
            .map(c => `<td> ${c.Quantity}</td><td><a href="/public/sds/${c.ItemNmbr}.pdf" target="_blank">${c.ItemDesc || ''}</a> </td><td>${c.Dgc}</td>`).join('</tr>\n<tr>') +
          '</tr></table></body></html>'
        )
      } else {
        res.status(200).send({ chemicals });
      }
    }
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/public/sds/:itemNmbr.pdf', (req, res) => {
  const params = req.params;
  const itemNmbr = params['itemNmbr'];
  getBasicChemicalInfo(itemNmbr).then(_ => getSdsPdf(_.docNo, _.cwNo)).then(_ => {
    res.contentType('application/pdf');
    res.status(200).send(_);
  }).catch((err: {code: number, message: string}) => {
    console.error(err);
    return res.status(err.code || 404).send(`
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body><p>Unable to load SDS. Please check the product code is correct.</p></body>
    </html>
    `);
  });
});

connect(sqlConfig, err => {
  if (err) {
    console.log('Failed to open a SQL Database connection.', err.message);
  }
  app.listen(parseInt(webConfig.port, 10), webConfig.ip, () => {
    console.log(`server started at http://localhost:${webConfig.port}`);
  });
});
