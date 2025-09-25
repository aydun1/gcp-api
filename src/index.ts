import { connect } from 'mssql';
import { compare, compareSync } from 'bcrypt';
import { BearerStrategy, IBearerStrategyOptionWithRequest, ITokenPayload } from 'passport-azure-ad';
import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import { createWriteStream } from 'fs';
import { join } from 'path';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';
import compression from 'compression';
import { createHmac, timingSafeEqual } from 'crypto';

import { getCustomer, getCustomerAddresses, getCustomers, getHistory, getInTransitTransfer, getInTransitTransfers, getItems, getOrders, updatePallets, writeInTransitTransferFile, getOrdersByLine, getOrderLines, getVendorAddresses, getVendors, getDeliveries, addDelivery, updateDelivery, removeDelivery, getProduction, updateAttachmentCount, addComment, getComments, getProductionSchedule } from './services/gp.service';
import { addNonInventoryChemical, getBasicChemicalInfo, getChemicals, getChemicalsOnRun, getMaterialsInFolder, getNonInventoryChemicals, getSdsPdf, getSyncedChemicals, linkChemical, removeNonInventoryChemical, unlinkChemical, updateNonInventoryChemicalQuantity, updateSDS } from './services/chemical.service';
import { sendChemicalSalesToEnvu } from './services/envu.service';
import { runShellCmd } from './services/helper.service';
import { adConfig, chemListKeyHash, definitivConfig, palletKeyHash, sqlConfig, webConfig } from './config';
import { Transfer } from './types/transfer';
import { Delivery } from './types/delivery';
import { Comment } from './types/comment';
import { RapidBody } from './types/rapid-body';
import { getSilos, getSuppliers, updateItem } from './services/silos.service';
import { updatePalletsBc } from './services/bc.service';
import { handleDefinitivEvent, handleRapidEvent, testEvent } from './services/timesheets.service';

interface Body {
  customer: string;
  palletType: string;
  palletQty: string;
  palletDate: string;
}

const accessLogStream = createWriteStream(join(__dirname, 'access.log'), { flags: 'a' });
const auth = passport.authenticate('oauth-bearer', {session: false}) as RequestHandler;

const options: IBearerStrategyOptionWithRequest = {
  identityMetadata: `https://${adConfig.metadata.authority}/${adConfig.credentials.tenantID}/${adConfig.metadata.version}/${adConfig.metadata.discovery}`,
  issuer: `https://${adConfig.metadata.authority}/${adConfig.credentials.tenantID}/${adConfig.metadata.version}`,
  clientID: adConfig.credentials.clientID,
  audience: adConfig.credentials.clientID,
  validateIssuer: adConfig.settings.validateIssuer,
  passReqToCallback: false,
  scope: adConfig.protectedRoutes.gp.scopes
};

const bearerStrategy = new BearerStrategy(options, (token: ITokenPayload, done: CallableFunction) => {
  done(null, {}, token);
});

const app = express();
app.use('/enews', express.static('enews'));
app.use('/footers', express.static('footers'));
app.use('/assets', express.static('assets'));
app.use(express.json());
app.use(helmet({contentSecurityPolicy: {directives: {'script-src': ['\'sha256-wZ87u4GRc1HGC1rEw9a/fxf1TpJzksmFGhr+Xd2brJU=\'']}}}));
app.use(morgan('combined', { stream: accessLogStream }));
app.use(passport.initialize());
app.use(compression());
passport.use(bearerStrategy);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE');
  next();
});

function handleError(err: any, res: Response) {
  if (err.code === 'ENOCONN') {
    connect(sqlConfig, err => {
      if (err) console.log('Failed to open a SQL Database connection.', err?.message)
    });
  }
  console.error(new Date());
  console.error(err?.message);
  return res.status(500).json({'result': err?.message || 'Internal server error'});
}

function verifyPalletApiToken(req: Request, res: Response, next: NextFunction) {
  const bearerToken = req.headers['authorization']?.split(' ')[1] || '';
  compare(bearerToken, palletKeyHash, (err, matched) => {
    if (!matched || err) res.sendStatus(401);
    next();
  });
}

function verifyChemicalListToken(req: Request, res: Response, next: NextFunction): void {
  const params = req.query;
  const bearerToken = params['key'] as string || '';
  const matched = compareSync(bearerToken, chemListKeyHash);
  if (!matched) res.sendStatus(401);
  next();
}

function verifyDefinitivMessage(req: Request, res: Response, next: NextFunction): void {
  const definitivSignature = Buffer.from((req.headers['definitiv-signature'] as string)?.replace('sha256=', ''));
  const hash = createHmac('sha256', definitivConfig.apiKey).update(req.body);
  const matched = timingSafeEqual(hash.digest(), definitivSignature);
  if (!matched) res.sendStatus(401);
  next();
}

// TODO
function verifyRapidMessage(req: Request, res: Response, next: NextFunction): void {
  const definitivSignature = Buffer.from((req.headers['definitiv-signature'] as string)?.replace('sha256=', ''));
  const hash = createHmac('sha256', definitivConfig.apiKey).update(req.body);
  const matched = timingSafeEqual(hash.digest(), definitivSignature);
  if (!matched) res.sendStatus(401);
  next();
}

app.get( '/', (req, res) => {
  res.send('');
});

app.get('/status', auth, (req, res) => {
  runShellCmd('./debug.sh').then(
    result => res.status(200).json({value: result})
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp', auth, (req, res) => {
  res.send('');
});

app.get('/gp/customers', auth, (req, res) => {
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

app.get('/gp/customers/:id(*)/addresses', auth, (req, res) => {
  getCustomerAddresses(req.params.id).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/customers/:id(*)', auth, (req, res) => {
  const custId = req.params.id.replace('\'\'', '\'');
  getCustomer(custId).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/vendors', auth, (req, res) => {
  const params = req.query;
  const search = params['search'] as string || '';
  const page = parseInt(params['page'] as string) || 1;
  getVendors(search, page).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/vendors/:id(*)/addresses', auth, (req, res) => {
  getVendorAddresses(req.params.id).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/pan', auth, (req, res) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  getItems(branch, [], '').then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/inventory', auth, (req, res) => {
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

app.get('/gp/inventory/required', auth, (req, res) => {
  getProduction().then(
    result => {
      res.status(200).send(result)
    }
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/inventory/:id/history', auth, (req, res) => {
  getHistory(req.params.id).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/inventory/:id/current', auth, (req, res) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  const components = params['comp'] === '1';
  getOrdersByLine(branch, [req.params.id], components).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/inventory/:id/schedule', auth, (req, res) => {
  getProductionSchedule(req.params.id).then(
    result => {
      res.status(200).send(result)
    }
  ).catch(err => {
    return handleError(err, res);
  });
});

app.post('/gp/inventory/orders', auth, (req, res) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  const components = params['comp'] === '1';
  getOrdersByLine(branch, req.body.itemNmbrs, components).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/inventory/:id/stock', auth, (req, res) => {
  getItems('', [req.params.id], '').then(
    result => res.status(200).send(result['lines'][0])
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/orders', auth, (req, res) => {
  const params = req.query;
  const branch = params['branch'] as string || '';
  const date = params['date'] as string || '';
  getOrders(branch, 'released', date).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/orders/:sopType/:sopNumber', auth, (req, res) => {
  const sopType = +req.params.sopType;
  const sopNumber = req.params.sopNumber;
  getOrderLines(sopType, sopNumber).then(
    result => res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.patch('/gp/orders/:sopType/:sopNumber', auth, (req, res) => {
  const sopNumber = req.params.sopNumber;
  const attachmentCount = 'attachmentCount' in req.body ? req.body['attachmentCount'] || 0 : 1;
  const increment = req.body['increment'];
  const creator = req.body['creator'];
  const branch = req.body['branch'];
  const id = req.body['id'] || 0;
  if (!id && !sopNumber) return;
  updateAttachmentCount(sopNumber, id, creator, branch, attachmentCount, increment).then(
    result => res.status(200).send({result})
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/itt', auth, (req, res) => {
  const params = req.query;
  const from = params['from'] as string || '';
  const to = params['to'] as string || '';
  getInTransitTransfers('', from, to).then(result => 
    res.status(200).send(result)
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/itt/:id', auth, (req, res) => {
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

app.post('/gp/itt', auth, (req, res) => {
  const body = req.body as Transfer;
  writeInTransitTransferFile(body.id, body.fromSite, body.toSite, body.lines).then(
    _ => res.status(200).send({docId: _, status: 'Successfully added ITT.'})
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/gp/comments/:id', auth, (req, res) => {
  getComments(+req.params.id).then(
    _ => res.status(200).send({comments: _})
  ).catch(err => {
    return handleError(err, res);
  });
});

app.post('/gp/comments', auth, (req, res) => {
  const body = req.body as Comment;
  addComment(body.DeliveryId, body.Comment, body.Commenter).then(
    _ => res.status(200).send({comments: _})
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
  updatePalletsBc(body.customer, body.palletType, body.palletQty);
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
  const userName = (req.authInfo as any)['name'];
  const userEmail = (req.authInfo as any)['preferred_username'];
  const body = req.body as {fields: Delivery};
  addDelivery(body.fields, userName, userEmail).then(_ => res.status(200).json(_)).catch(err => {
    console.log(err);
    return handleError(err, res);
  });
});

app.post('/gp/deliveries/batch', auth, (req, res) => {
  const userName = (req.authInfo as any)['name'];
  const userEmail = (req.authInfo as any)['preferred_username'];
  const body = req.body as {requests: [{id: number, method: string, body: {fields: Delivery}}]};
  const updates = body.requests.filter(_ => _.method.toUpperCase() === 'PATCH').map(_ => updateDelivery(_.id, _.body.fields, userName, userEmail));
  const deletes = body.requests.filter(_ => _.method.toUpperCase() === 'DELETE').map(_ => removeDelivery(_.id, userName, userEmail));
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

app.post('/gp/non-inventory-chemicals', auth, (req, res) => {
  const body = req.body as {itemNmbr: string, itemDesc: string, size: number, units: string};
  addNonInventoryChemical(body.itemNmbr, body.itemDesc, body.size, body.units).then(_ => res.status(200).json(_)).catch((err: {code: number, message: string}) => {
    return handleError(err, res);
  });
});

app.delete('/gp/non-inventory-chemicals/:id(*)', auth, (req, res) => {
  const itemNmbr = req.params.id;
  removeNonInventoryChemical(itemNmbr).then(_ => res.status(200).json(_)).catch((err: {code: number, message: string}) => {
    return handleError(err, res);
  });
});

app.post('/gp/non-inventory-chemical-qty', auth, (req, res) => {
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

app.get('/materials', auth, (req, res) => {
  getSilos().then(
    result => res.status(200).json({value: result})
  ).catch(err => {
    return handleError(err, res);
  });
});

app.get('/materials/suppliers', auth, (req, res) => {
  getSuppliers().then(
    result => res.status(200).json({value: result})
  ).catch(err => {
    return handleError(err, res);
  });
});

app.patch('/materials/:id', auth, (req, res) => {
  const reorderLevel = req.body['reorderLevel'];
  const shipmentLevel = req.body['shipmentLevel'];
  const criticalLevel = req.body['criticalLevel'];
  const material = req.body['material'];
  const supplierId = +req.body['supplierId'];
  updateItem(+req.params.id, reorderLevel, shipmentLevel, criticalLevel, material, supplierId).then(
    result => res.status(200).json({value: result})
  ).catch(err => {
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
  const type = params['category'] as string || '';
  getChemicals(branch, '', type, '', 'Name').then(chemicals => {res.status(200).send(
    `<html>
  <head>
    <title>GCP SDS List</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>#chem-input{font-size:16px;padding: 12px 20px 12px 20px;border:1px solid #ddd;max-width:100%;} #chem-list{padding: 0px 20px;}</style>
  </head>
  <body>
    <h2>Chemical Registry</h2>
    <input type="text" id="chem-input" placeholder="Search..." title="Type in a name">
    <ul id="chem-list">
      ${chemicals.chemicals.filter(_ => _.sdsExists)
        .filter((v,i,a)=>a.findIndex(v2=>(v2.DocNo===v.DocNo))===i)
        .map(c => `<li><a href="/public/sds/${c.ItemNmbr}.pdf" target="_blank">${c.Name || ''}</a></li>`).join('\n      ') || '<li>Nothing here...</li>'}
    </ul>
  </body>
</html>
<script>
  addEventListener('input', (event) => {
    const filter = event.target.value.toUpperCase();
    const list = document.getElementById('chem-list').getElementsByTagName('li');
    Array.from(list).forEach(_ => _.style.display = _.textContent.toUpperCase().includes(filter) ? '' : 'none');
  });
</script>
      `
    )}).catch(err => {
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

app.get('/public/chemical-sales', (req, res) => {
  sendChemicalSalesToEnvu().then(_ => {
    res.status(200).send(_);
  }).catch((err: {code: number, message: string}) => {
    console.log(err);
    return res.status(err.code || 404).send(``);
  });
});

app.post('/definitiv/webhook/subscriber/events/:event', verifyDefinitivMessage, (req, res) => {
  const params = req.params;
  const eventName = params['event'];
  handleDefinitivEvent(req.body, eventName).then(_ => {
    res.status(200).send(_);
  }).catch((err: {code: number, message: string}) => {
    console.log(err);
    return res.status(err.code || 404).send(``);
  });
});

app.post('/rapid/webhook/subscriber/events', (req, res) => {
  const body = req.body as RapidBody;
  handleRapidEvent(body).then(_ => {
    res.status(200).send(_);
  }).catch((err: {code: number, message: string}) => {
    console.log(err?.message || err);
    return res.status(err.code || 404).send(``);
  });
  res.status(200).send('');
});

app.get('/rapid/webhook/subscriber/events', (req, res) => {
  handleRapidEvent(req.body).then(_ => {
    res.status(200).send(_);
  }).catch((err: {code: number, message: string}) => {
    console.log(err?.message || err);
    return res.status(err.code || 404).send(``);
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


const checkinBody = {
  config: {},
  location: {
    id: 'f80201db-883f-4af5-9bf2-2506cd3a03ef',
    name: 'Stapylton',
    timezone: 'Australia/Brisbane',
    hubIds: [],
    dateCreated: '2025-09-15T02:13:47.909Z',
    lastUpdated: '2025-09-15T02:13:47.909Z'
  },
  users: [
    {
      name: 'wayne.wickens@gardencityplastics.com',
      email: 'wayne.wickens@gardencityplastics.com',
      dateCreated: '2025-06-12T00:47:47.444Z',
      lastUpdated: '2025-06-12T00:48:13.048Z'
    },
    {
      name: 'sunee.bam@gardencityplastics.com',
      email: 'sunee.bam@gardencityplastics.com',
      dateCreated: '2025-06-12T00:48:07.608Z',
      lastUpdated: '2025-06-12T00:48:19.311Z'
    },
    {
      name: "Aidan O'Brien",
      email: 'aidan.obrien@gardencityplastics.com',
      dateCreated: '2025-08-06T05:31:32.678Z',
      lastUpdated: '2025-08-06T05:31:41.161Z'
    }
  ],
  profile: {
    id: 'ec11a943-0e01-423e-b0a4-ceb7b1ea8668',
    name: "Peter Constable",
    email: 'peter.constable@kingislanddairy.com',
    phone: '+61415419822',
    metadata: [],
    dateCreated: '2025-08-07T05:31:59.958Z',
    lastUpdated: '2025-08-07T05:33:07.955Z'
  },
  labels: [
    {
      id: 'e676fe47-178d-4300-91a6-fd8889081c40',
      name: 'Visitor',
      color: 'BLUE',
      dateCreated: '2025-05-29T05:55:02.521Z',
      lastUpdated: '2025-09-19T06:02:02.647Z'
    }
  ],
  event: {
    id: 'a277779e-0e5f-4b78-93ab-19d5948b18ae',
    topic: 'CHECKIN_EXITED',
    version: 1,
    companyId: 464,
    timestamp: '2025-09-22T05:15:00.471Z',
    serverTimestamp: '2025-09-22T05:14:13.999Z',
    data: {
      id: 'b7e3a613-83d1-4209-90e9-54caa4ff824b',
      locationId: 'f80201db-883f-4af5-9bf2-2506cd3a03ef',
      created: '2025-09-22T05:15:00.471Z',
      status: 'OUT',
      identityId: 'ec11a943-0e01-423e-b0a4-ceb7b1ea8668',
    }
  },
  webhookId: '67cce9d2-0a6d-4d5b-a1e4-1cbf2a776325',
  alternativeProfiles: []
} as unknown as RapidBody;