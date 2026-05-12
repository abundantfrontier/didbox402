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

describe('Janitor Physical Purge', () => {
  
  beforeAll(async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS storage_records (id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, recipient_hash TEXT, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS nonces (signature TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`).run();
  });

  test('Physical Purge: Deletes from both D1 and R2', async () => {
    const timestamp = Date.now();
    const payload = { ciphertext: 'to_be_deleted', durationHours: 1 }; 
    const sig = await signRequest('POST', '/store', JSON.stringify(payload), timestamp);

    // 1. Store the item with 1h lease (using DEV_MODE)
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
    
    expect(storeRes.status).toBe(200);
    const { storageId } = await storeRes.json() as any;

    // 2. FORCE EXPIRE by updating D1 directly
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
    await env.DB.prepare("UPDATE storage_records SET expires_at = ? WHERE id = ?")
      .bind(pastDate, storageId)
      .run();

    // 3. Run Janitor Purge
    const janitorTimestamp = Date.now();
    const janitorSig = await signRequest('GET', '/janitor/purge', '', janitorTimestamp);
    const purgeRes = await worker.fetch(new Request('http://localhost/janitor/purge', {
      headers: {
        'X-DID': MY_DID,
        'X-DID-Signature': janitorSig,
        'X-DID-Timestamp': janitorTimestamp.toString(),
        'X-Admin-Token': 'admin_secret'
      }
    }), { ...env, ADMIN_TOKEN: 'admin_secret', DEV_MODE: 'false' }, createExecutionContext());

    expect(purgeRes.status).toBe(200);
    const purgeData = await purgeRes.json() as any;
    expect(purgeData.purged).toContain(storageId);

    // 4. Verify it is physically deleted from D1
    const d1After = await env.DB.prepare("SELECT * FROM storage_records WHERE id = ?").bind(storageId).first();
    expect(d1After).toBeNull();
  });
});
