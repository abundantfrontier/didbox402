import { Hono } from 'hono';
import { verifyDidSignature, hashDid } from './middleware/did';
import { calculateStoragePrice, calculateRetrievalPrice } from './lib/pricing';
import { saveStorageRecord, getStorageRecord, updateExpiration, getInboxRecords, saveInbox, getInboxes, getExpiredRecords, deleteStorageRecord } from './lib/storage';
import { verifyAnyPayment, issueDualChallenge } from './lib/payments';
import { Env } from './types/env';

const app = new Hono<{ Bindings: Env }>();

/**
 * Helper to get JSON body from context or request.
 */
async function getJsonBody(c: any) {
  const bodyText = c.get('bodyText');
  if (bodyText) return JSON.parse(bodyText);
  return c.req.json();
}

// All routes require DID authentication
app.use('*', verifyDidSignature);

/**
 * GET /price
 * Discover current storage and egress rates.
 */
/**
 * GET /.well-known/didbox-configuration
 * Capability discovery for the node.
 */
app.get('/.well-known/didbox-configuration', async (c) => {
  return c.json({
    version: '0.6.0',
    supported_rails: ['L402', 'x402'],
    limits: {
      max_payload_bytes: 10 * 1024 * 1024,
      max_duration_hours: 8760
    },
    endpoints: {
      store: '/store',
      retrieve: '/retrieve/:id',
      inbox: '/inbox/:alias',
      price: '/price'
    }
  });
});

app.get('/price', async (c) => {
  return c.json({
    base_rate_per_mb_hour: parseInt(c.env.BASE_RATE_PER_MB_HOUR || '100'),
    inbox_creation_fee: parseInt(c.env.INBOX_CREATION_FEE || '1000'),
    egress_rate_per_mb: parseInt(c.env.EGRESS_RATE_PER_MB || '0'),
    min_charge_mb: 1
  });
});
/**
 * POST /inboxes
 * Creates a named inbox for the authenticated DID.
 */
app.post('/inboxes', async (c) => {
  const { alias } = await getJsonBody(c);
  const did = c.get('did');
  const ownerHash = c.get('hashedDid');
  const salt = c.env.SERVICE_SALT || 'default_salt';

  const hashedId = await hashDid(did + (alias || 'default'), salt);

  const creationFee = parseInt(c.env.INBOX_CREATION_FEE || '1000');
  if (!(await verifyAnyPayment(c, creationFee))) {
    return issueDualChallenge(c, creationFee);
  }

  await saveInbox(c.env.DB, {
    owner_hash: ownerHash,
    alias: alias || 'default',
    hashed_id: hashedId,
    created_at: new Date().toISOString(),
  });

  return c.json({ alias: alias || 'default', hashedId, feePaid: creationFee });
});

/**
 * GET /inboxes
 * List all created inboxes for the DID.
 */
app.get('/inboxes', async (c) => {
  const ownerHash = c.get('hashedDid');
  const inboxes = await getInboxes(c.env.DB, ownerHash);
  return c.json({ inboxes });
});

/**
 * POST /store
 */
app.post('/store', async (c) => {
  const { ciphertext, durationHours, recipientDid, inboxAlias } = await getJsonBody(c);
  
  // 1. Enforce Max Duration (1 Year = 8760 hours)
  if (durationHours > 8760) {
    return c.json({ error: 'Max duration is 8760 hours (1 year)' }, 400);
  }

  const sizeBytes = new TextEncoder().encode(ciphertext).length;
  
  // 2. Enforce Payload Size Limit (10MB for MVP)
  if (sizeBytes > 10 * 1024 * 1024) {
    return c.json({ error: 'Payload too large (Max 10MB)' }, 413);
  }

  const baseRate = parseInt(c.env.BASE_RATE_PER_MB_HOUR || '100');
  const price = calculateStoragePrice(sizeBytes, durationHours, baseRate);

  if (!(await verifyAnyPayment(c, price))) {
    return issueDualChallenge(c, price);
  }

  const storageId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
  
  const salt = c.env.SERVICE_SALT || 'default_salt';
  const ownerHash = c.get('hashedDid');
  const recipientHash = recipientDid ? 
    await hashDid(recipientDid + (inboxAlias || 'default'), salt) : 
    null;

  await c.env.STORAGE_BUCKET.put(`ciphertext/${storageId}`, ciphertext);

  await saveStorageRecord(c.env.DB, {
    id: storageId,
    owner_hash: ownerHash,
    recipient_hash: recipientHash,
    size_bytes: sizeBytes,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  });

  return c.json({
    storageId,
    expiresAt,
    sizeBytes,
    pricePaidSatoshis: price
  });
});

/**
* GET /retrieve/:id
*/
app.get('/retrieve/:id', async (c) => {
  const id = c.req.param('id');
  const alias = c.req.header('X-Inbox-Alias') || 'default';
  const record = await getStorageRecord(c.env.DB, id);

  if (!record) return c.json({ error: 'Not found' }, 404);

  if (new Date() > new Date(record.expires_at)) {
    return c.json({ error: 'Expired' }, 410);
  }

  const did = c.get('did');
  const salt = c.env.SERVICE_SALT || 'default_salt';
  const ownerHash = c.get('hashedDid');
  const recipientHashForAlias = await hashDid(did + alias, salt);

  if (ownerHash !== record.owner_hash && recipientHashForAlias !== record.recipient_hash) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const object = await c.env.STORAGE_BUCKET.get(`ciphertext/${id}`);
  if (!object) return c.json({ error: 'Blob not found' }, 404);

  const ciphertext = await object.text();
  return c.json({ ciphertext });
});

/**
 * GET /inbox/:alias?
 */
app.get('/inbox/:alias?', async (c) => {
  const alias = c.req.param('alias') || 'default';
  const did = c.get('did');
  const salt = c.env.SERVICE_SALT || 'default_salt';
  
  const recipientHash = await hashDid(did + alias, salt);
  const records = await getInboxRecords(c.env.DB, recipientHash);
  
  return c.json({ 
    alias,
    items: records.map(r => ({
      id: r.id,
      sizeBytes: r.size_bytes,
      expiresAt: r.expires_at
    }))
  });
});

/**
 * POST /extend/:id
 */
app.post('/extend/:id', async (c) => {
  const id = c.req.param('id');
  const { additionalHours } = await getJsonBody(c);
  
  const record = await getStorageRecord(c.env.DB, id);
  if (!record) return c.json({ error: 'Not found' }, 404);

  const ownerHash = c.get('hashedDid');
  if (ownerHash !== record.owner_hash) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const baseRate = parseInt(c.env.BASE_RATE_PER_MB_HOUR || '100');
  const extraCost = calculateStoragePrice(record.size_bytes, additionalHours, baseRate);

  if (!(await verifyAnyPayment(c, extraCost))) {
    return issueDualChallenge(c, extraCost);
  }

  const newExpiresAt = new Date(new Date(record.expires_at).getTime() + additionalHours * 3600 * 1000).toISOString();
  await updateExpiration(c.env.DB, id, newExpiresAt);

  return c.json({
    storageId: id,
    newExpiresAt,
    additionalCostSatoshis: extraCost
  });
});

/**
 * GET /janitor/purge
 */
app.get('/janitor/purge', async (c) => {
  const adminToken = c.req.header('X-Admin-Token');
  if (adminToken !== c.env.ADMIN_TOKEN && c.env.DEV_MODE !== 'true') {
    return c.json({ error: 'Unauthorized Janitor Access' }, 401);
  }

  const expired = await getExpiredRecords(c.env.DB, 50);
  const results = [];

  for (const record of expired) {
    await c.env.STORAGE_BUCKET.delete(`ciphertext/${record.id}`);
    await deleteStorageRecord(c.env.DB, record.id);
    results.push(record.id);
  }

  // Purge old nonces
  await c.env.DB.prepare("DELETE FROM nonces WHERE expires_at < ?").bind(Date.now()).run();

  return c.json({ purged: results });
});

export default app;
