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

describe('Inbox Management', () => {
  
  beforeAll(async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS inboxes (owner_hash TEXT NOT NULL, alias TEXT NOT NULL, hashed_id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_records (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, recipient_hash TEXT, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS nonces (signature TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`).run();
  });

  test('Create and List Inboxes', async () => {
    const timestamp = Date.now();
    const payload = { alias: 'work-project' };
    const sig = await signRequest('POST', '/inboxes', JSON.stringify(payload), timestamp);

    // 1. Get Challenge
    const res1 = await worker.fetch(new Request('http://localhost/inboxes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      },
      body: JSON.stringify(payload)
    }), { ...env, DEV_MODE: 'true' }, createExecutionContext());
    expect(res1.status).toBe(402);

    const challenge = res1.headers.get('WWW-Authenticate') || '';
    const parts = challenge.substring(5).split(',').reduce((acc: any, part) => {
      const [key, value] = part.trim().split('=');
      acc[key] = value.replace(/"/g, '');
      return acc;
    }, {});
    const decoded = JSON.parse(Buffer.from(parts.macaroon, 'base64').toString());

    // 2. Retry with Proof (FRESH SIG)
    const timestamp2 = Date.now() + 5;
    const sig2 = await signRequest('POST', '/inboxes', JSON.stringify(payload), timestamp2);

    const createRes = await worker.fetch(new Request('http://localhost/inboxes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig2,
        'X-DID-Timestamp': timestamp2.toString(),
        'Authorization': `L402 ${parts.macaroon}:${decoded._mock_preimage}`
      },
      body: JSON.stringify(payload)
    }), { ...env, DEV_MODE: 'true' }, createExecutionContext());

    expect(createRes.status).toBe(200);

    // 3. List Inboxes
    const listTimestamp = Date.now() + 10;
    const listSig = await signRequest('GET', '/inboxes', '', listTimestamp);
    const listRes = await worker.fetch(new Request('http://localhost/inboxes', {
      headers: {
        'X-DID': MY_DID,
        'X-DID-Signature': listSig,
        'X-DID-Timestamp': listTimestamp.toString()
      }
    }), { ...env, DEV_MODE: 'true' }, createExecutionContext());

    expect(listRes.status).toBe(200);
    const data = await listRes.json() as any;
    expect(data.inboxes).toHaveLength(1);
    expect(data.inboxes[0].alias).toBe('work-project');
  });

  test('Scoped Inbox Retrieval', async () => {
    // Store in 'work' alias (using DEV_MODE to bypass complex L402 flow for simplicity in this test)
    const timestamp = Date.now() + 15;
    const payload = { ciphertext: 'work_data', durationHours: 1, recipientDid: MY_DID, inboxAlias: 'work' };
    const sig = await signRequest('POST', '/store', JSON.stringify(payload), timestamp);

    await worker.fetch(new Request('http://localhost/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      },
      body: JSON.stringify(payload)
    }), { ...env, DEV_MODE: 'true' }, createExecutionContext());

    // Query 'personal' alias - should be empty
    const personalTimestamp = Date.now() + 20;
    const personalSig = await signRequest('GET', '/inbox/personal', '', personalTimestamp);
    const personalRes = await worker.fetch(new Request('http://localhost/inbox/personal', {
      headers: {
        'X-DID': MY_DID,
        'X-DID-Signature': personalSig,
        'X-DID-Timestamp': personalTimestamp.toString()
      }
    }), { ...env, DEV_MODE: 'true' }, createExecutionContext());
    expect((await personalRes.json() as any).items).toHaveLength(0);

    // Query 'work' alias - should have 1 item
    const workTimestamp = Date.now() + 25;
    const workSig = await signRequest('GET', '/inbox/work', '', workTimestamp);
    const workRes = await worker.fetch(new Request('http://localhost/inbox/work', {
      headers: {
        'X-DID': MY_DID,
        'X-DID-Signature': workSig,
        'X-DID-Timestamp': workTimestamp.toString()
      }
    }), { ...env, DEV_MODE: 'true' }, createExecutionContext());
    expect((await workRes.json() as any).items).toHaveLength(1);
  });
});
