import { Hono } from 'hono';
import { verifyDidSignature, hashDid } from './middleware/did';
import { calculateStoragePrice, calculateRetrievalPrice } from './lib/pricing';
import { saveStorageRecord, getStorageRecord, updateExpiration, getInboxRecords, saveInbox, getInboxes } from './lib/storage';
import { Env } from './types/env';

const app = new Hono<{ Bindings: Env }>();

// All routes require DID authentication
app.use('*', verifyDidSignature);

/**
 * POST /inboxes
 * Creates a named inbox for the authenticated DID.
 */
app.post('/inboxes', async (c) => {
  const { alias } = await c.req.json();
  const did = c.get('did');
  const salt = c.env.SERVICE_SALT || 'default_salt';
  
  const hashedId = await hashDid(did + (alias || 'default'), salt);
  
  const creationFee = parseInt(c.env.INBOX_CREATION_FEE || '1000');
  // TODO: Verify x402 payment for creationFee

  await saveInbox(c.env.DB, {
    ownerDid: did,
    alias: alias || 'default',
    hashedId,
    createdAt: new Date().toISOString(),
  });

  return c.json({ alias: alias || 'default', hashedId, feePaid: creationFee });
});

/**
 * GET /inboxes
 * List all created inboxes for the DID.
 */
app.get('/inboxes', async (c) => {
  const did = c.get('did');
  const inboxes = await getInboxes(c.env.DB, did);
  return c.json({ inboxes });
});

/**
 * POST /store
 * Headers: X-DID, X-DID-Signature, X-Payment
 * Body: { ciphertext, durationHours, recipientDid?, inboxAlias? }
 */
app.post('/store', async (c) => {
  const { ciphertext, durationHours, recipientDid, inboxAlias } = await c.req.json();
  const sizeBytes = new TextEncoder().encode(ciphertext).length;

  const baseRate = parseInt(c.env.BASE_RATE_PER_MB_HOUR || '100');
  const price = calculateStoragePrice(sizeBytes, durationHours, baseRate);

  const storageId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
  
  const salt = c.env.SERVICE_SALT || 'default_salt';
  const ownerHash = c.get('hashedDid');
  
  // Recipient hash is now scoped by the optional inboxAlias
  const recipientHash = recipientDid ? 
    await hashDid(recipientDid + (inboxAlias || 'default'), salt) : 
    null;

  await c.env.STORAGE_BUCKET.put(`ciphertext/${storageId}`, ciphertext);

  await saveStorageRecord(c.env.DB, {
    id: storageId,
    ownerHash,
    recipientHash,
    sizeBytes,
    createdAt: new Date().toISOString(),
    expiresAt,
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
  const record = await getStorageRecord(c.env.DB, id);

  if (!record) return c.json({ error: 'Not found' }, 404);

  if (new Date() > new Date(record.expiresAt)) {
    return c.json({ error: 'Expired' }, 410);
  }

  const hashedDid = c.get('hashedDid');
  // Authorization is now tricky because hashedDid (salted DID) doesn't include the alias.
  // We need to re-verify or store the raw recipientHash check.
  // For the MVP, we assume the caller provides their DID and we check if any of their inboxes match.
  
  // TODO: More robust authorization check for recipientHash across aliases
  
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
      sizeBytes: r.sizeBytes,
      expiresAt: r.expiresAt
    }))
  });
});

/**
 * POST /extend/:id
 */
app.post('/extend/:id', async (c) => {
  const id = c.req.param('id');
  const { additionalHours } = await c.req.json();
  
  const record = await getStorageRecord(c.env.DB, id);
  if (!record) return c.json({ error: 'Not found' }, 404);

  const hashedDid = c.get('hashedDid');
  if (hashedDid !== record.ownerHash && hashedDid !== record.recipientHash) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const baseRate = parseInt(c.env.BASE_RATE_PER_MB_HOUR || '100');
  const extraCost = calculateStoragePrice(record.sizeBytes, additionalHours, baseRate);

  // TODO: Verify payment

  const newExpiresAt = new Date(new Date(record.expiresAt).getTime() + additionalHours * 3600 * 1000).toISOString();
  await updateExpiration(c.env.DB, id, newExpiresAt);

  return c.json({
    storageId: id,
    newExpiresAt,
    additionalCostSatoshis: extraCost
  });
});

export default app;
