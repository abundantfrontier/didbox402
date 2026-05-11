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
  });

  test('Create and List Inboxes', async () => {
    const timestamp = Date.now();
    const payload = { alias: 'work-project' };
    const sig = await signRequest('POST', '/inboxes', JSON.stringify(payload), timestamp);

    const createRes = await worker.fetch(new Request('http://localhost/inboxes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString(),
        'X-Payment': 'preimage_1000_ok'
      },
      body: JSON.stringify(payload)
    }), env, createExecutionContext());

    expect(createRes.status).toBe(200);

    // List Inboxes
    const listTimestamp = Date.now();
    const listSig = await signRequest('GET', '/inboxes', '', listTimestamp);
    const listRes = await worker.fetch(new Request('http://localhost/inboxes', {
      headers: {
        'X-DID': MY_DID,
        'X-DID-Signature': listSig,
        'X-DID-Timestamp': listTimestamp.toString()
      }
    }), env, createExecutionContext());

    expect(listRes.status).toBe(200);
    const data = await listRes.json() as any;
    expect(data.inboxes).toHaveLength(1);
    expect(data.inboxes[0].alias).toBe('work-project');
  });

  test('Scoped Inbox Retrieval', async () => {
    // Store in 'work' alias
    const timestamp = Date.now();
    const payload = { ciphertext: 'work_data', durationHours: 1, recipientDid: MY_DID, inboxAlias: 'work' };
    const sig = await signRequest('POST', '/store', JSON.stringify(payload), timestamp);

    await worker.fetch(new Request('http://localhost/store', {
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

    // Query 'personal' alias - should be empty
    const personalTimestamp = Date.now();
    const personalSig = await signRequest('GET', '/inbox/personal', '', personalTimestamp);
    const personalRes = await worker.fetch(new Request('http://localhost/inbox/personal', {
      headers: {
        'X-DID': MY_DID,
        'X-DID-Signature': personalSig,
        'X-DID-Timestamp': personalTimestamp.toString()
      }
    }), env, createExecutionContext());
    expect((await personalRes.json() as any).items).toHaveLength(0);

    // Query 'work' alias - should have 1 item
    const workTimestamp = Date.now();
    const workSig = await signRequest('GET', '/inbox/work', '', workTimestamp);
    const workRes = await worker.fetch(new Request('http://localhost/inbox/work', {
      headers: {
        'X-DID': MY_DID,
        'X-DID-Signature': workSig,
        'X-DID-Timestamp': workTimestamp.toString()
      }
    }), env, createExecutionContext());
    expect((await workRes.json() as any).items).toHaveLength(1);
  });
});
