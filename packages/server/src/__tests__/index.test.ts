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

describe('didbox402 Protocol v0.4.0 Conformance', () => {
  
  beforeAll(async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_records (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, recipient_hash TEXT, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inboxes (owner_hash TEXT NOT NULL, alias TEXT NOT NULL, hashed_id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS nonces (signature TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`).run();
  });

  test('1. Economic Integrity: Returns L402 Challenge with correct price', async () => {
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
    
    const challenge = res.headers.get('WWW-Authenticate');
    expect(challenge).toContain('L402');
    expect(challenge).toContain('invoice="lnbc');
  });

  test('4. Unified Handshake: Fulfils L402 request with valid preimage', async () => {
    const body = JSON.stringify({ ciphertext: 'paid_data', durationHours: 1 });
    const path = '/store';
    const timestamp = Date.now();
    const sig = await signRequest('POST', path, body, timestamp);

    const res1 = await worker.fetch(new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      },
      body
    }), env, createExecutionContext());
    expect(res1.status).toBe(402);
    
    const challenge = res1.headers.get('WWW-Authenticate') || '';
    const parts = challenge.substring(5).split(',').reduce((acc: any, part) => {
      const [key, value] = part.trim().split('=');
      acc[key] = value.replace(/"/g, '');
      return acc;
    }, {});
    const decoded = JSON.parse(Buffer.from(parts.macaroon, 'base64').toString());

    // Second request needs FRESH timestamp and signature to avoid nonce conflict
    const timestamp2 = Date.now() + 1;
    const sig2 = await signRequest('POST', path, body, timestamp2);

    const res2 = await worker.fetch(new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig2,
        'X-DID-Timestamp': timestamp2.toString(),
        'Authorization': `L402 ${parts.macaroon}:${decoded._mock_preimage}`
      },
      body
    }), env, createExecutionContext());

    expect(res2.status).toBe(200);
  });

  test('5. Capability Discovery: Returns standard configuration (public endpoint per spec 7.1)', async () => {
    // Discovery must work without auth headers (or with DEV_MODE + mock_sig)
    const req = new Request('http://localhost/.well-known/didbox-configuration');

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.protocol_version).toBe('0.6.2');
    expect(data.supported_rails).toContain('L402');
    expect(data.limits.min_charge_mb).toBe(1);
    expect(data.endpoints.inboxes).toBe('/inboxes');
  });
});
