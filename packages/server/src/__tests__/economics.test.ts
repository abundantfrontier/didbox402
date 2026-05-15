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

describe('Economics & Limits Hardening', () => {
  
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
      CREATE TABLE IF NOT EXISTS nonces (
        signature TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      )
    `).run();
  });
  
  test('Minimum charge: 1 byte for 1 hour results in 1MB minimum charge', async () => {
    const body = JSON.stringify({ ciphertext: 'a', durationHours: 1 });
    const timestamp = Date.now();
    const sig = await signRequest('POST', '/store', body, timestamp);

    const req = new Request('http://localhost/store', {
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
    // 1MB * 1 hour * 100 base rate = 100 Satoshis
    expect(data.amount_satoshis).toBe(100);
  });

  test('Rounding: 1.5MB for 2 hours rounds up correctly', async () => {
    // 1.5MB = 1,572,864 bytes
    const largeBody = 'x'.repeat(1.5 * 1024 * 1024);
    const body = JSON.stringify({ ciphertext: largeBody, durationHours: 2 });
    const timestamp = Date.now();
    const sig = await signRequest('POST', '/store', body, timestamp);

    const req = new Request('http://localhost/store', {
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
    // 1.5MB * 2 hours * 100 base rate = 300 Satoshis
    expect(data.amount_satoshis).toBe(300);
  });

  test('Max Duration Limit: Rejects duration > 1 year (8760 hours)', async () => {
    const body = JSON.stringify({ ciphertext: 'test', durationHours: 9000 });
    const timestamp = Date.now();
    const sig = await signRequest('POST', '/store', body, timestamp);

    const req = new Request('http://localhost/store', {
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
    expect(res.status).toBe(400); 
    const data: any = await res.json();
    expect(data.error).toContain('Max duration');
  });

  test('Payload Size Limit: Rejects extremely large payloads', async () => {
    const giantBody = 'x'.repeat(11 * 1024 * 1024);
    const body = JSON.stringify({ ciphertext: giantBody, durationHours: 1 });
    const timestamp = Date.now();
    const sig = await signRequest('POST', '/store', body, timestamp);

    const req = new Request('http://localhost/store', {
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
    expect(res.status).toBe(413); // Payload Too Large
  });

  test('GET /price: Returns correct schema and authentication', async () => {
    const timestamp = Date.now();
    const sig = await signRequest('GET', '/price', '', timestamp);

    const req = new Request('http://localhost/price', {
      headers: {
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      }
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data).toHaveProperty('base_rate_per_mb_hour');
    expect(data).toHaveProperty('inbox_creation_fee');
    expect(data).toHaveProperty('egress_rate_per_mb');
    expect(data).toHaveProperty('min_charge_mb');
    expect(data.min_charge_mb).toBe(1);
  });
});
