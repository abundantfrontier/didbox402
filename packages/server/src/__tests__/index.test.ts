import { expect, test, describe, beforeAll } from 'vitest';
import { env, createExecutionContext } from 'cloudflare:test';
import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import bs58 from 'bs58';
import worker from '../index';

// noble-ed25519 v3+ requires SHA-512 to be set manually
ed.hashes.sha512 = (msg: Uint8Array) => sha512(msg);

const privKey = crypto.getRandomValues(new Uint8Array(32));
const pubKey = await ed.getPublicKey(privKey);

// did:key:z6Mk...
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

describe('didbox402 Protocol v0.3.0 Conformance', () => {
  
  beforeAll(async () => {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS storage_records (
        id TEXT PRIMARY KEY,
        owner_hash TEXT NOT NULL,
        recipient_hash TEXT,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `).run();
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS inboxes (
        owner_hash TEXT NOT NULL,
        alias TEXT NOT NULL,
        hashed_id TEXT NOT NULL PRIMARY KEY,
        created_at TEXT NOT NULL
      )
    `).run();
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS nonces (
        signature TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      )
    `).run();
  });

  test('1. Economic Integrity: Returns 402 Challenge with correct price', async () => {
    const body = JSON.stringify({ ciphertext: 'test_data', durationHours: 1 });
    const path = '/store';
    const timestamp = Date.now();
    const sig = await signRequest('POST', path, body, timestamp);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      },
      body
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(402);
    
    const data: any = await res.json();
    expect(data.amount_satoshis).toBe(100);
    expect(res.headers.get('X-Invoice')).toContain('lnbc');
  });

  test('2. Signature Binding: Rejects modified body', async () => {
    const originalBody = JSON.stringify({ ciphertext: 'test_data', durationHours: 1 });
    const modifiedBody = JSON.stringify({ ciphertext: 'test_data', durationHours: 100 });
    const path = '/store';
    const timestamp = Date.now();
    const sig = await signRequest('POST', path, originalBody, timestamp);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      },
      body: modifiedBody
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(401);
    const data: any = await res.json();
    expect(data.error).toContain('Invalid DID Signature');
  });

  test('3. Temporal Security: Rejects stale timestamps', async () => {
    const body = JSON.stringify({ ciphertext: 'stale_data', durationHours: 1 });
    const path = '/store';
    const staleTimestamp = Date.now() - 10 * 60 * 1000; // 10 mins old
    const sig = await signRequest('POST', path, body, staleTimestamp);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': staleTimestamp.toString()
      },
      body
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(401);
    const data: any = await res.json();
    expect(data.error).toContain('X-DID-Timestamp outside allowed window');
  });

  test('4. x402 Handshake: Fulfils request with valid preimage', async () => {
    const body = JSON.stringify({ ciphertext: 'paid_data', durationHours: 1 });
    const path = '/store';
    const timestamp = Date.now();
    const sig = await signRequest('POST', path, body, timestamp);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString(),
        'X-Payment': 'preimage_100_abc'
      },
      body
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.pricePaidSatoshis).toBe(100);
  });
});
