import { Hono } from 'hono';
import { verifyDidSignature, hashDid } from './middleware/did';
import { calculateStoragePrice, calculateEgressPrice } from './lib/pricing';
import { saveStorageRecord, getStorageRecord, updateExpiration, getInboxRecords, saveInbox, getInboxes, getExpiredRecords, deleteStorageRecord, getOwnerRecords } from './lib/storage';
import { requireBilling, getBillingMode } from './lib/billing';
import { hasConfiguredEntitlementKeys } from './lib/entitlement';
import { storageBytesFromCiphertext, transferBytesFromRetrieveBody } from './lib/sizing';
import { isVitestRuntime } from './lib/runtime';
import { hexToBytes } from './lib/bytes';
import { Env } from './types/env';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import bs58 from 'bs58';

ed.hashes.sha512 = (msg: Uint8Array) => sha512(msg);

let nodeDid: string | null = null;
let nodePublicKey: Uint8Array | null = null;
let nodeIdentityInitialized = false;

function initializeNodeIdentity(env: Env) {
  if (nodeIdentityInitialized) return;

  const privKeyHex = env.NODE_SIGNING_PRIVATE_KEY;
  const did = env.NODE_DID;

  if (!privKeyHex || !did) {
    nodeIdentityInitialized = true;
    return;
  }

  try {
    const privKey = hexToBytes(privKeyHex);
    if (privKey.length === 32 && did.startsWith('did:key:z6Mk')) {
      nodeDid = did;
      nodePublicKey = ed.getPublicKey(privKey);
    }
  } catch {
    // Optional node identity — ignore invalid configuration.
  }

  nodeIdentityInitialized = true;
}

function getNodeIdentity() {
  if (!nodeDid || !nodePublicKey) {
    throw new Error('Node identity is not configured');
  }

  const prefix = new Uint8Array([0xed, 0x01]);
  const combined = new Uint8Array(prefix.length + nodePublicKey.length);
  combined.set(prefix);
  combined.set(nodePublicKey, prefix.length);

  return {
    did: nodeDid,
    public_key: bs58.encode(combined),
  };
}

function getMinChargeMb(env: Env): number {
  const configured = parseInt(env.MIN_CHARGE_MB || '1', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 1;
}

function getPricingMode(env: Env): 'public' | 'authenticated' {
  return env.PRICING_MODE === 'authenticated' ? 'authenticated' : 'public';
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  if (isVitestRuntime()) {
    c.env.DEV_MODE = 'true';
  }
  return next();
});

app.use('*', async (c, next) => {
  const salt = c.env.SERVICE_SALT || 'default_salt';
  const dangerous = ['test_salt', 'default_salt', ''];
  if (c.env.DEV_MODE !== 'true' && dangerous.includes(salt)) {
    return c.json({ error: 'Misconfigured node: insecure SERVICE_SALT (see spec 10.2)' }, 500);
  }
  if (
    c.env.DEV_MODE !== 'true' &&
    getBillingMode(c.env) === 'entitlement' &&
    !hasConfiguredEntitlementKeys(c.env)
  ) {
    return c.json({
      error: 'Misconfigured node: BILLING_MODE=entitlement requires ENTITLEMENT_KEY_HASHES (see spec 10.2)',
      code: 'MISCONFIGURED_ENTITLEMENT',
    }, 500);
  }
  return next();
});

app.onError((err, c) => {
  console.error('Unhandled error in worker:', err);
  return c.json({
    error: 'Internal Server Error',
    message: err instanceof Error ? err.message : 'Unknown error',
  }, 500);
});

app.use('*', async (c, next) => {
  await next();
  c.header('Date', new Date().toUTCString());
});

async function getJsonBody(c: any) {
  const bodyText = c.get('bodyText');
  if (bodyText) return JSON.parse(bodyText);
  return c.req.json();
}

app.use('*', verifyDidSignature);

app.get('/.well-known/didbox-configuration', async (c) => {
  initializeNodeIdentity(c.env);

  const minChargeMb = getMinChargeMb(c.env);
  const billingMode = getBillingMode(c.env);
  const response: Record<string, unknown> = {
    protocol_version: '0.9.1',
    billing_mode: billingMode,
    supported_rails: billingMode === 'entitlement' ? [] : ['L402', 'x402'],
    pricing_mode: getPricingMode(c.env),
    limits: {
      max_payload_bytes: 10 * 1024 * 1024,
      max_lease_hours: 8760,
      min_charge_mb: minChargeMb,
    },
    endpoints: {
      store: '/store',
      retrieve: '/retrieve/{id}',
      extend: '/extend/{id}',
      delete: '/store/{id}',
      inbox: '/inbox/{alias}',
      inboxes: '/inboxes',
      leases: '/leases',
      price: '/price',
    },
  };

  if (billingMode === 'entitlement') {
    response.entitlement = {
      methods: ['api_key'],
      header: 'X-DIDBOX-Entitlement',
      key_format: 'dbx_ent_<id>.<secret>',
    };
  }

  if (nodeDid && nodePublicKey) {
    try {
      response.node_identity = getNodeIdentity();
    } catch {
      // Optional identity — omit when unavailable.
    }
  }

  return c.json(response);
});

app.get('/price', async (c) => {
  return c.json({
    base_rate_per_mb_hour: parseInt(c.env.BASE_RATE_PER_MB_HOUR || '100', 10),
    inbox_creation_fee: parseInt(c.env.INBOX_CREATION_FEE || '1000', 10),
    egress_rate_per_mb: parseInt(c.env.EGRESS_RATE_PER_MB || '0', 10),
    min_charge_mb: getMinChargeMb(c.env),
  });
});

app.get('/leases', async (c) => {
  const ownerHash = c.get('hashedDid');
  const records = await getOwnerRecords(c.env.DB, ownerHash);

  return c.json({
    leases: records.map((r) => ({
      id: r.id,
      sizeBytes: r.size_bytes,
      expiresAt: r.expires_at,
      recipientHash: r.recipient_hash,
    })),
  });
});

app.post('/inboxes', async (c) => {
  const { alias } = await getJsonBody(c);
  const did = c.get('did');
  const ownerHash = c.get('hashedDid');
  const salt = c.env.SERVICE_SALT || 'default_salt';

  const hashedId = await hashDid(did + (alias || 'default'), salt);

  const creationFee = parseInt(c.env.INBOX_CREATION_FEE || '1000', 10);
  const inboxBilling = await requireBilling(c, creationFee, 24);
  if (!inboxBilling.authorized) {
    return inboxBilling.response;
  }

  await saveInbox(c.env.DB, {
    owner_hash: ownerHash,
    alias: alias || 'default',
    hashed_id: hashedId,
    created_at: new Date().toISOString(),
  });

  return c.json({
    alias: alias || 'default',
    hashedId,
    ...inboxBilling.receipt,
  });
});

app.get('/inboxes', async (c) => {
  const ownerHash = c.get('hashedDid');
  const inboxes = await getInboxes(c.env.DB, ownerHash);
  return c.json({ inboxes });
});

app.post('/store', async (c) => {
  const { ciphertext, durationHours, recipientDid, inboxAlias } = await getJsonBody(c);

  if (!Number.isInteger(durationHours) || durationHours < 1) {
    return c.json({ error: 'durationHours must be a positive integer' }, 400);
  }

  if (durationHours > 8760) {
    return c.json({ error: 'Max duration is 8760 hours (1 year)' }, 400);
  }

  const storageBytes = storageBytesFromCiphertext(ciphertext);
  if (storageBytes === null) {
    return c.json({ error: 'ciphertext must be valid base64-encoded bytes' }, 400);
  }

  const maxPayload = 10 * 1024 * 1024;
  if (storageBytes > maxPayload) {
    return c.json({ error: 'Payload too large (Max 10MB)' }, 413);
  }

  const minChargeMb = getMinChargeMb(c.env);
  const baseRate = parseInt(c.env.BASE_RATE_PER_MB_HOUR || '100', 10);
  const price = calculateStoragePrice(storageBytes, durationHours, baseRate, minChargeMb);

  const storeBilling = await requireBilling(c, price, durationHours);
  if (!storeBilling.authorized) {
    return storeBilling.response;
  }

  const storageId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();

  const salt = c.env.SERVICE_SALT || 'default_salt';
  const ownerHash = c.get('hashedDid');
  const recipientHash = recipientDid
    ? await hashDid(recipientDid + (inboxAlias || 'default'), salt)
    : null;

  await c.env.STORAGE_BUCKET.put(`ciphertext/${storageId}`, ciphertext);

  await saveStorageRecord(c.env.DB, {
    id: storageId,
    owner_hash: ownerHash,
    recipient_hash: recipientHash,
    size_bytes: storageBytes,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  });

  return c.json({
    storageId,
    expiresAt,
    sizeBytes: storageBytes,
    ...storeBilling.receipt,
  });
});

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
    return c.json({ error: 'Unauthorized', code: 'ACCESS_DENIED' }, 403);
  }

  const object = await c.env.STORAGE_BUCKET.get(`ciphertext/${id}`);
  if (!object) return c.json({ error: 'Blob not found' }, 404);

  const ciphertext = await object.text();
  const transferBytes = transferBytesFromRetrieveBody(ciphertext);
  const egressRate = parseInt(c.env.EGRESS_RATE_PER_MB || '0', 10);

  if (egressRate > 0) {
    const egressCost = calculateEgressPrice(transferBytes, egressRate, getMinChargeMb(c.env));
    const egressBilling = await requireBilling(c, egressCost, 1);
    if (!egressBilling.authorized) {
      return egressBilling.response;
    }
  }

  return c.json({ ciphertext });
});

app.delete('/store/:id', async (c) => {
  const id = c.req.param('id');
  const record = await getStorageRecord(c.env.DB, id);

  if (!record) return c.json({ error: 'Not found' }, 404);

  const ownerHash = c.get('hashedDid');
  if (ownerHash !== record.owner_hash) {
    return c.json({ error: 'Not found' }, 404);
  }

  if (new Date() > new Date(record.expires_at)) {
    return c.json({ error: 'Expired' }, 410);
  }

  await c.env.STORAGE_BUCKET.delete(`ciphertext/${id}`);
  await deleteStorageRecord(c.env.DB, id);

  return c.body(null, 204);
});

app.get('/inbox/:alias?', async (c) => {
  const alias = c.req.param('alias') || 'default';
  const did = c.get('did');
  const salt = c.env.SERVICE_SALT || 'default_salt';

  const recipientHash = await hashDid(did + alias, salt);
  const records = await getInboxRecords(c.env.DB, recipientHash);

  return c.json({
    alias,
    items: records.map((r) => ({
      id: r.id,
      sizeBytes: r.size_bytes,
      expiresAt: r.expires_at,
    })),
  });
});

app.post('/extend/:id', async (c) => {
  const id = c.req.param('id');
  const { additionalHours } = await getJsonBody(c);

  if (!Number.isInteger(additionalHours) || additionalHours < 1) {
    return c.json({ error: 'additionalHours must be a positive integer' }, 400);
  }

  const record = await getStorageRecord(c.env.DB, id);
  if (!record) return c.json({ error: 'Not found' }, 404);

  const ownerHash = c.get('hashedDid');
  if (ownerHash !== record.owner_hash) {
    return c.json({ error: 'Unauthorized', code: 'ACCESS_DENIED' }, 403);
  }

  const minChargeMb = getMinChargeMb(c.env);
  const baseRate = parseInt(c.env.BASE_RATE_PER_MB_HOUR || '100', 10);
  const extraCost = calculateStoragePrice(record.size_bytes, additionalHours, baseRate, minChargeMb);

  const extendBilling = await requireBilling(c, extraCost, additionalHours);
  if (!extendBilling.authorized) {
    return extendBilling.response;
  }

  const newExpiresAt = new Date(new Date(record.expires_at).getTime() + additionalHours * 3600 * 1000).toISOString();
  await updateExpiration(c.env.DB, id, newExpiresAt);

  return c.json({
    storageId: id,
    newExpiresAt,
    amountPaid: extendBilling.receipt.amountPaid,
    currency: extendBilling.receipt.currency,
    rail: extendBilling.receipt.rail,
    additionalCostSatoshis: extendBilling.receipt.additionalCostSatoshis,
  });
});

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

  await c.env.DB.prepare('DELETE FROM nonces WHERE expires_at < ?').bind(Date.now()).run();

  return c.json({ purged: results });
});

export default app;