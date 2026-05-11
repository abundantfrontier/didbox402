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

describe('Authentication & Security Gauntlet', () => {
  
  beforeAll(async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_records (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, recipient_hash TEXT, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS nonces (signature TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`).run();
  });

  describe('Header Integrity', () => {
    test('Rejects request with missing X-DID', async () => {
      const req = new Request('http://localhost/price');
      const res = await worker.fetch(req, env, createExecutionContext());
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: expect.stringContaining('Missing X-DID') });
    });

    test('Rejects request with missing X-DID-Timestamp', async () => {
      const req = new Request('http://localhost/price', {
        headers: { 'X-DID': MY_DID, 'X-DID-Signature': 'mock' }
      });
      const res = await worker.fetch(req, env, createExecutionContext());
      expect(res.status).toBe(401);
      // The middleware returns a combined error message
      expect(await res.json()).toMatchObject({ error: expect.stringContaining('Missing X-DID') });
    });
  });

  describe('DID Parsing (Multibase/Multicodec)', () => {
    test('Rejects malformed multibase', async () => {
      const req = new Request('http://localhost/price', {
        headers: {
          'X-DID': 'did:key:zInvalidBase58!',
          'X-DID-Signature': 'mock_sig',
          'X-DID-Timestamp': Date.now().toString()
        }
      });
      const res = await worker.fetch(req, env, createExecutionContext());
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: expect.stringContaining('Authentication Error') });
    });

    test('Rejects wrong multicodec prefix (non-Ed25519)', async () => {
      const wrongPrefix = new Uint8Array([0x00, 0x01]); // Not 0xed01
      const combinedWrong = new Uint8Array(wrongPrefix.length + 32);
      combinedWrong.set(wrongPrefix);
      const WRONG_DID = `did:key:z${bs58.encode(combinedWrong)}`;

      const req = new Request('http://localhost/price', {
        headers: {
          'X-DID': WRONG_DID,
          'X-DID-Signature': 'mock_sig',
          'X-DID-Timestamp': Date.now().toString()
        }
      });
      const res = await worker.fetch(req, env, createExecutionContext());
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: expect.stringContaining('Only Ed25519 (did:key:z6Mk) is supported') });
    });
  });

  describe('Temporal Security (Drift Window)', () => {
    test('Rejects timestamp exactly 5m 1s in the past', async () => {
      const staleTimestamp = Date.now() - (5 * 60 * 1000 + 1000);
      const sig = await signRequest('GET', '/price', '', staleTimestamp);
      const req = new Request('http://localhost/price', {
        headers: {
          'X-DID': MY_DID,
          'X-DID-Signature': sig,
          'X-DID-Timestamp': staleTimestamp.toString()
        }
      });
      const res = await worker.fetch(req, env, createExecutionContext());
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: 'X-DID-Timestamp outside allowed window' });
    });

    test('Rejects future timestamp (+6 minutes)', async () => {
      const futureTimestamp = Date.now() + (6 * 60 * 1000);
      const sig = await signRequest('GET', '/price', '', futureTimestamp);
      const req = new Request('http://localhost/price', {
        headers: {
          'X-DID': MY_DID,
          'X-DID-Signature': sig,
          'X-DID-Timestamp': futureTimestamp.toString()
        }
      });
      const res = await worker.fetch(req, env, createExecutionContext());
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: 'X-DID-Timestamp outside allowed window' });
    });

    test('Accepts timestamp at 4m 59s boundary', async () => {
      const validTimestamp = Date.now() - (5 * 60 * 1000 - 1000);
      const sig = await signRequest('GET', '/price', '', validTimestamp);
      const req = new Request('http://localhost/price', {
        headers: {
          'X-DID': MY_DID,
          'X-DID-Signature': sig,
          'X-DID-Timestamp': validTimestamp.toString()
        }
      });
      const res = await worker.fetch(req, env, createExecutionContext());
      expect(res.status).toBe(200);
    });
  });

  describe('Janitor Security', () => {
    test('Rejects /janitor/purge with wrong token', async () => {
      const timestamp = Date.now();
      const sig = await signRequest('GET', '/janitor/purge', '', timestamp);
      const res = await worker.fetch(new Request('http://localhost/janitor/purge', {
        headers: {
          'X-DID': MY_DID,
          'X-DID-Signature': sig,
          'X-DID-Timestamp': timestamp.toString(),
          'X-Admin-Token': 'wrong_token'
        }
      }), { ...env, ADMIN_TOKEN: 'correct_token', DEV_MODE: 'false' }, createExecutionContext());
      
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: 'Unauthorized Janitor Access' });
    });
  });
});
