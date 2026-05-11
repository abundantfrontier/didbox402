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
  });

  test('Store and Retrieve Flow', async () => {
    const timestamp = Date.now();
    const payload = { ciphertext: 'storage_test', durationHours: 1 };
    const sig = await signRequest('POST', '/store', JSON.stringify(payload), timestamp);

    const storeRes = await worker.fetch(new Request('http://localhost/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString(),
        'X-Payment': 'preimage_100_ok'
      },
      body: JSON.stringify(payload)
    }), env, createExecutionContext());

    expect(storeRes.status).toBe(200);
    const { storageId } = await storeRes.json() as any;

    // Retrieve
    const retrieveTimestamp = Date.now();
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

  test('Prevents unauthorized retrieval', async () => {
    // Evil DID
    const evilPriv = crypto.getRandomValues(new Uint8Array(32));
    const evilPub = await ed.getPublicKey(evilPriv);
    const combinedEvil = new Uint8Array(multicodec.length + evilPub.length);
    combinedEvil.set(multicodec);
    combinedEvil.set(evilPub, multicodec.length);
    const EVIL_DID = `did:key:z${bs58.encode(combinedEvil)}`;

    // Store something first
    const timestamp = Date.now();
    const payload = { ciphertext: 'private_data', durationHours: 1 };
    const sig = await signRequest('POST', '/store', JSON.stringify(payload), timestamp);
    const storeRes = await worker.fetch(new Request('http://localhost/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString(),
        'X-Payment': 'preimage_100_ok'
      },
      body: JSON.stringify(payload)
    }), env, createExecutionContext());
    const { storageId } = await storeRes.json() as any;

    // Try retrieve as Evil DID
    const evilTimestamp = Date.now();
    const emptyBodyHash = sha256(new Uint8Array(0));
    const evilRequestHash = sha256(new TextEncoder().encode(`${evilTimestamp}GET/retrieve/${storageId}${Buffer.from(emptyBodyHash).toString('hex')}`));
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
