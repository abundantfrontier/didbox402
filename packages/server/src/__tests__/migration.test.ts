import { describe, test, expect, beforeAll } from 'vitest';
import { env, createExecutionContext } from 'cloudflare:test';
import worker from '../index';
import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import bs58 from 'bs58';
import canonicalize from 'canonicalize';

ed.hashes.sha512 = (msg: Uint8Array) => sha512(msg);

// Generate a test client DID
const clientPrivKey = crypto.getRandomValues(new Uint8Array(32));
const clientPubKey = await ed.getPublicKey(clientPrivKey);
const clientMulticodec = new Uint8Array([0xed, 0x01]);
const clientCombined = new Uint8Array(clientMulticodec.length + clientPubKey.length);
clientCombined.set(clientMulticodec);
clientCombined.set(clientPubKey, clientMulticodec.length);
const CLIENT_DID = `did:key:z${bs58.encode(clientCombined)}`;

// Generate a test NODE signing keypair (same pattern as client)
const nodePrivKey = crypto.getRandomValues(new Uint8Array(32));
const nodePubKey = await ed.getPublicKey(nodePrivKey);
const nodeMulticodec = new Uint8Array([0xed, 0x01]);
const nodeCombined = new Uint8Array(nodeMulticodec.length + nodePubKey.length);
nodeCombined.set(nodeMulticodec);
nodeCombined.set(nodePubKey, nodeMulticodec.length);
const NODE_DID = `did:key:z${bs58.encode(nodeCombined)}`;
const NODE_SIGNING_PRIVATE_KEY = Buffer.from(nodePrivKey).toString('hex');

// Helper to sign requests (same as other tests)
async function signRequest(method: string, path: string, body: string, timestamp: number, privKey: Uint8Array): Promise<string> {
  const bodyHash = sha256(new TextEncoder().encode(body));
  const requestHash = sha256(new TextEncoder().encode(`${timestamp}${method}${path}${Buffer.from(bodyHash).toString('hex')}`));
  const signature = await ed.sign(requestHash, privKey);
  return Buffer.from(signature).toString('hex');
}

describe('v0.7.0 Sovereign Mobility - Migration Authorization', () => {

  beforeAll(async () => {
    // Set Node Identity for tests (strict mode)
    env.NODE_SIGNING_PRIVATE_KEY = NODE_SIGNING_PRIVATE_KEY;
    env.NODE_DID = NODE_DID;
    env.DEV_MODE = 'true'; // Keep lenient for tests

    // Create required tables
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS storage_records (
        id TEXT PRIMARY KEY,
        owner_hash TEXT NOT NULL,
        recipient_hash TEXT,
        size_bytes INTEGER NOT NULL,
        ciphertext_hash TEXT,
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
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS used_payments (payment_id TEXT PRIMARY KEY, rail TEXT NOT NULL, amount INTEGER NOT NULL, used_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`).run();
  });

  async function createTestBox(durationHours = 24) {
    const storageId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

    const { hashDid } = await import('../middleware/did');
    const ownerHash = await hashDid(CLIENT_DID, env.SERVICE_SALT || 'default_salt');

    await env.DB.prepare(`
      INSERT INTO storage_records (id, owner_hash, recipient_hash, size_bytes, ciphertext_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      storageId,
      ownerHash,
      null,
      1024 * 1024,
      null,
      now.toISOString(),
      expiresAt.toISOString()
    ).run();

    const testData = new TextEncoder().encode('test-ciphertext-for-migration');
    await env.STORAGE_BUCKET.put(`ciphertext/${storageId}`, testData);

    return storageId;
  }

  test('Discovery returns node_identity when configured', async () => {
    const req = new Request('http://localhost/.well-known/didbox-configuration');

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(200);

    const data: any = await res.json();
    expect(data.node_identity).toBeDefined();
    expect(data.node_identity.did).toBe(NODE_DID);
  });

  test('Owner can successfully request a Migration Authorization', async () => {
    const storageId = await createTestBox(24);

    const timestamp = Date.now();
    const path = `/migrate/${storageId}/authorize`;
    const body = '';
    const sig = await signRequest('POST', path, body, timestamp, clientPrivKey);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'X-DID': CLIENT_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      }
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(200);

    const auth: any = await res.json();

    expect(auth.version).toBe(1);
    expect(auth.original_storage_id).toBe(storageId);
    expect(auth.owner_did).toBe(CLIENT_DID);
    expect(auth.ciphertext_hash).toMatch(/^sha256:/);
    expect(auth.remaining_lease_hours).toBeGreaterThan(0);
    expect(auth.signature).toBeDefined();
    expect(auth.issuance_nonce).toBeDefined();
  });

  test('Non-owner cannot request Migration Authorization (403)', async () => {
    const storageId = await createTestBox();

    // Different DID
    const otherPrivKey = crypto.getRandomValues(new Uint8Array(32));
    const otherPubKey = await ed.getPublicKey(otherPrivKey);
    const otherCombined = new Uint8Array([0xed, 0x01, ...otherPubKey]);
    const OTHER_DID = `did:key:z${bs58.encode(otherCombined)}`;

    const timestamp = Date.now();
    const path = `/migrate/${storageId}/authorize`;
    const sig = await signRequest('POST', path, '', timestamp, otherPrivKey);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'X-DID': OTHER_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      }
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(403);
  });

  test('Returns 404 for non-existent storageId', async () => {
    const timestamp = Date.now();
    const fakeId = 'non-existent-uuid';
    const path = `/migrate/${fakeId}/authorize`;
    const sig = await signRequest('POST', path, '', timestamp, clientPrivKey);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'X-DID': CLIENT_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      }
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(404);
  });

  test('Returns 410 for expired lease', async () => {
    const storageId = await createTestBox(0); // already expired

    const timestamp = Date.now();
    const path = `/migrate/${storageId}/authorize`;
    const sig = await signRequest('POST', path, '', timestamp, clientPrivKey);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'X-DID': CLIENT_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      }
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(410);
  });

  test('Migration Authorization has valid signature format and structure', async () => {
    const storageId = await createTestBox();

    const timestamp = Date.now();
    const path = `/migrate/${storageId}/authorize`;
    const sig = await signRequest('POST', path, '', timestamp, clientPrivKey);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'X-DID': CLIENT_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      }
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    const auth: any = await res.json();

    // Structural validation (full cryptographic verification of JCS + Ed25519
    // is performed by the server using the canonicalize package)
    expect(auth.signature).toMatch(/^[0-9a-f]{128}$/i);
    expect(auth.version).toBe(1);
    expect(auth.issuance_nonce).toBeTruthy();
    expect(auth.ciphertext_hash).toMatch(/^sha256:/);
    expect(typeof auth.remaining_lease_hours).toBe('number');
  });

  // =====================================================
  // ADVANCED TEST: Full cryptographic signature verification
  // =====================================================
  test('Migration Authorization signature is cryptographically valid (JCS + Ed25519)', async () => {
    const storageId = await createTestBox();

    const timestamp = Date.now();
    const path = `/migrate/${storageId}/authorize`;
    const sig = await signRequest('POST', path, '', timestamp, clientPrivKey);

    const req = new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'X-DID': CLIENT_DID,
        'X-DID-Signature': sig,
        'X-DID-Timestamp': timestamp.toString()
      }
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(200);

    const auth: any = await res.json();

    // 1. Extract public key from the node's did:key
    const multibase = NODE_DID.substring(9);
    const decoded = bs58.decode(multibase);
    const pubKeyBytes = decoded.slice(2);

    // 2. For verification, we must canonicalize the object WITHOUT the signature field
    // (the server signed the object before attaching the signature)
    const authForVerification = { ...auth };
    delete authForVerification.signature;

    const canonicalJson = canonicalize(authForVerification);
    expect(canonicalJson).toBeTruthy();

    // 3. Hash and verify
    const messageHash = sha256(new TextEncoder().encode(canonicalJson));
    const signatureBytes = Buffer.from(auth.signature, 'hex');

    const isValid = await ed.verify(signatureBytes, messageHash, pubKeyBytes);

    expect(isValid).toBe(true);
  });
});