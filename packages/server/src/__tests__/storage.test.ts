import { expect, test, describe, beforeAll } from 'vitest';
import { env, createExecutionContext } from 'cloudflare:test';
import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import bs58 from 'bs58';
import worker from '../index';

ed.hashes.sha512 = (msg: Uint8Array) => sha512(msg);

const privKey = crypto.getRandomValues(new Uint8Array(32));
const pubKey = await ed.getPublicKey(privKey);
const multicodec = new Uint8Array([0xed, 0x01]);
const combined = new Uint8Array(multicodec.length + pubKey.length);
combined.set(multicodec);
combined.set(pubKey, multicodec.length);
const MY_DID = `did:key:z${bs58.encode(combined)}`;

async function signRequest(method: string, path: string, body: string, timestamp: number): Promise<string> {
  const bodyHash = sha256(new TextEncoder().encode(body));
  const requestHash = sha256(new TextEncoder().encode(`${timestamp}${method}${path}${Buffer.from(bodyHash).toString('hex')}`));
  const signature = await ed.sign(requestHash, privKey);
  return Buffer.from(signature).toString('hex');
}

describe('Storage Operations', () => {
  
  beforeAll(async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_records (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, recipient_hash TEXT, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS nonces (signature TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`).run();
  });

  test('Store and Retrieve Flow', async () => {
    const timestamp = Date.now();
    const payload = { ciphertext: 'storage_test', durationHours: 1 };
    const sig = await signRequest('POST', '/store', JSON.stringify(payload), timestamp);

    // 1. Get Challenge
    const res1 = await worker.fetch(new Request('http://localhost/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      },
      body: JSON.stringify(payload)
    }), env, createExecutionContext());
    expect(res1.status).toBe(402);

    const challenge = res1.headers.get('WWW-Authenticate') || '';
    const parts = challenge.substring(5).split(',').reduce((acc: any, part) => {
      const [key, value] = part.trim().split('=');
      acc[key] = value.replace(/"/g, '');
      return acc;
    }, {});
    const decoded = JSON.parse(Buffer.from(parts.macaroon, 'base64').toString());

    // 2. Retry with Proof
    const timestamp2 = Date.now() + 10;
    const sig2 = await signRequest('POST', '/store', JSON.stringify(payload), timestamp2);

    const storeRes = await worker.fetch(new Request('http://localhost/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig2,
        'X-DID-Timestamp': timestamp2.toString(),
        'Authorization': `L402 ${parts.macaroon}:${decoded._mock_preimage}`
      },
      body: JSON.stringify(payload)
    }), env, createExecutionContext());

    expect(storeRes.status).toBe(200);
    const { storageId } = await storeRes.json() as any;

    // 3. Retrieve
    const retrieveTimestamp = Date.now() + 20;
    const retrieveSig = await signRequest('GET', `/retrieve/${storageId}`, '', retrieveTimestamp);
    const retrieveRes = await worker.fetch(new Request(`http://localhost/retrieve/${storageId}`, {
      headers: {
        'X-DID': MY_DID,
        'X-DID-Signature': retrieveSig,
        'X-DID-Timestamp': retrieveTimestamp.toString()
      }
    }), env, createExecutionContext());

    expect(retrieveRes.status).toBe(200);
    const retrieved = await retrieveRes.json() as any;
    expect(retrieved.ciphertext).toBe('storage_test');
  });

  test('Privacy Invariant: Raw DID never appears in DB', async () => {
    const { results } = await env.DB.prepare("SELECT * FROM storage_records").all();
    for (const row of results as any[]) {
      expect(JSON.stringify(row)).not.toContain(MY_DID);
    }
  });

  test('Replay Protection: Rejects reused valid signature (nonce tracking)', async () => {
    const timestamp = Date.now() + 30;
    const payload = { ciphertext: 'replay_test', durationHours: 1 };
    const sig = await signRequest('POST', '/store', JSON.stringify(payload), timestamp);

    const headers = {
      'Content-Type': 'application/json',
      'X-DID': MY_DID,
      'X-DID-Signature': sig,
      'X-DID-Timestamp': timestamp.toString()
    };

    // First request should get 402 but CACHE THE NONCE
    const res1 = await worker.fetch(new Request('http://localhost/store', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }), env, createExecutionContext());
    expect(res1.status).toBe(402);

    // Second request with SAME signature and timestamp should fail with Replay detected
    const res2 = await worker.fetch(new Request('http://localhost/store', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }), env, createExecutionContext());
    
    expect(res2.status).toBe(401);
    expect(await res2.json()).toMatchObject({ error: expect.stringContaining('Replay detected') });
  });

  test('Prevents unauthorized retrieval', async () => {
    const evilPriv = crypto.getRandomValues(new Uint8Array(32));
    const evilPub = await ed.getPublicKey(evilPriv);
    const combinedEvil = new Uint8Array(multicodec.length + evilPub.length);
    combinedEvil.set(multicodec);
    combinedEvil.set(evilPub, multicodec.length);
    const EVIL_DID = `did:key:z${bs58.encode(combinedEvil)}`;

    // Store something first (using DEV_MODE)
    const timestamp = Date.now() + 40;
    const payload = { ciphertext: 'private_data', durationHours: 1 };
    const sig = await signRequest('POST', '/store', JSON.stringify(payload), timestamp);
    const storeRes = await worker.fetch(new Request('http://localhost/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      },
      body: JSON.stringify(payload)
    }), { ...env, DEV_MODE: 'true' }, createExecutionContext());
    const { storageId } = await storeRes.json() as any;

    // Try retrieve as Evil DID
    const evilTimestamp = Date.now() + 50;
    const emptyBodyHash = Buffer.from(sha256(new Uint8Array(0))).toString('hex');
    const evilRequestHash = sha256(new TextEncoder().encode(`${evilTimestamp}GET/retrieve/${storageId}${emptyBodyHash}`));
    const evilSig = Buffer.from(await ed.sign(evilRequestHash, evilPriv)).toString('hex');

    const retrieveRes = await worker.fetch(new Request(`http://localhost/retrieve/${storageId}`, {
      headers: {
        'X-DID': EVIL_DID,
        'X-DID-Signature': evilSig,
        'X-DID-Timestamp': evilTimestamp.toString()
      }
    }), env, createExecutionContext());

    expect(retrieveRes.status).toBe(403);
  });
});
