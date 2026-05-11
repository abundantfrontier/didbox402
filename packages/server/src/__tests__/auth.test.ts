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

describe('Authentication & Security', () => {
  
  beforeAll(async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_records (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, recipient_hash TEXT, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`).run();
  });

  test('Rejects request with missing headers', async () => {
    const res = await worker.fetch(new Request('http://localhost/price'), env, createExecutionContext());
    expect(res.status).toBe(401);
    const data: any = await res.json();
    expect(data.error).toContain('Missing X-DID');
  });

  test('Rejects request with malformed DID', async () => {
    const timestamp = Date.now();
    const req = new Request('http://localhost/price', {
      headers: {
        'X-DID': 'did:key:invalid',
        'X-DID-Signature': 'mock',
        'X-DID-Timestamp': timestamp.toString()
      }
    });
    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(401);
    const data: any = await res.json();
    expect(data.error).toContain('multibase');
  });

  test('Rejects stale timestamps', async () => {
    const timestamp = Date.now() - 10 * 60 * 1000;
    const sig = await signRequest('GET', '/price', '', timestamp);
    const req = new Request('http://localhost/price', {
      headers: {
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      }
    });
    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'X-DID-Timestamp outside allowed window' });
  });

  test('Rejects signature mismatch (tampering)', async () => {
    const timestamp = Date.now();
    const sig = await signRequest('GET', '/price', '', timestamp);
    // Change path to /store but keep /price signature
    const req = new Request('http://localhost/store', {
      headers: {
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      }
    });
    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'Invalid DID Signature' });
  });

  test('Authorizes valid requests', async () => {
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
  });
});
