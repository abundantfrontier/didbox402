import { expect, test, describe, beforeAll } from 'vitest';
import { env, createExecutionContext } from 'cloudflare:test';
import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import worker from '../index';

// noble-ed25519 v3+ requires SHA-512 to be set manually
ed.hashes.sha512 = (msg: Uint8Array) => sha512(msg);

const privKey = crypto.getRandomValues(new Uint8Array(32));
const pubKey = await ed.getPublicKey(privKey);
const MY_DID = `did:key:z6Mk${Buffer.from(pubKey).toString('base64')}`;

async function signRequest(method: string, path: string, body: string): Promise<string> {
  const bodyHash = sha256(new TextEncoder().encode(body));
  const requestHash = sha256(new TextEncoder().encode(`${method}${path}${Buffer.from(bodyHash).toString('hex')}`));
  const signature = await ed.sign(requestHash, privKey);
  return Buffer.from(signature).toString('hex');
}

describe('didbox402 Protocol v0.2.0 Conformance', () => {
  
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
        owner_did TEXT NOT NULL,
        alias TEXT NOT NULL,
        hashed_id TEXT NOT NULL PRIMARY KEY,
        created_at TEXT NOT NULL
      )
    `).run();
  });

  test('1. Economic Integrity: Returns 402 Challenge with correct price', async () => {
    const body = JSON.stringify({ ciphertext: 'test_data', durationHours: 1 });
    const path = '/store';
    const sig = await signRequest('POST', path, body);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig
      },
      body
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(402);
    
    const data: any = await res.json();
    expect(data.amount_satoshis).toBe(100);
    expect(res.headers.get('X-Invoice')).toContain('lnbc');
  });

  test('2. x402 Handshake: Fulfils request with valid preimage', async () => {
    const body = JSON.stringify({ ciphertext: 'paid_data', durationHours: 1 });
    const path = '/store';
    const sig = await signRequest('POST', path, body);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-Payment': 'preimage_100_abc' // Real-ish mock logic
      },
      body
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.pricePaidSatoshis).toBe(100);
  });

  test('3. Local Dev Mode Bypass', async () => {
    // Override env for this test
    const devEnv = { ...env, DEV_MODE: 'true' };
    
    const body = JSON.stringify({ ciphertext: 'dev_data', durationHours: 1 });
    const path = '/store';
    const sig = await signRequest('POST', path, body);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig
        // No payment header
      },
      body
    });

    const res = await worker.fetch(req, devEnv, createExecutionContext());
    expect(res.status).toBe(200); // Bypass worked
  });
});
