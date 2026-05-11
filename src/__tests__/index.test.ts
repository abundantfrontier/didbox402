import { expect, test, describe, beforeAll } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../index';

const MY_DID = 'did:key:z6MkpTHR8VNs2H68cH7MbcN6n4v49uGHx2bC98B6Jm';
const OTHER_DID = 'did:key:z6Mkf869mT8VNs2H68cH7MbcN6n4v49uGHx2bC98B6Jm';

describe('didbox402 Protocol Conformance', () => {
  
  beforeAll(async () => {
    // Basic schema initialization for D1
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

  test('1. Economic Integrity: Returns 402 with correct price when payment is missing', async () => {
    const payload = { ciphertext: 'test_data', durationHours: 1 };
    const req = new Request('http://localhost/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': 'mock_sig'
      },
      body: JSON.stringify(payload)
    });

    const res = await worker.fetch(req, env, createExecutionContext());
    expect(res.status).toBe(402);
    
    const data: any = await res.json();
    expect(data.error).toBe('Payment Required');
    // 10 bytes text -> fits in 1MB -> 1 hour * 100 base rate = 100 Satoshis
    expect(data.amount_satoshis).toBe(100);
  });

  test('2. Sovereign Access: Prevents unauthorized retrieval', async () => {
    // First, store something as MY_DID for OTHER_DID
    const storeReq = new Request('http://localhost/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': 'mock_sig',
        'X-Payment': 'mock_pay'
      },
      body: JSON.stringify({
        ciphertext: 'secret_payload',
        durationHours: 1,
        recipientDid: OTHER_DID
      })
    });
    
    const storeRes = await worker.fetch(storeReq, env, createExecutionContext());
    const { storageId } = await storeRes.json() as any;

    // Try to retrieve with a random DID
    const retrieveReq = new Request(`http://localhost/retrieve/${storageId}`, {
      headers: {
        'X-DID': 'did:key:z6Mrandom',
        'X-DID-Signature': 'mock_sig'
      }
    });
    
    const retrieveRes = await worker.fetch(retrieveReq, env, createExecutionContext());
    expect(retrieveRes.status).toBe(403);
  });

  test('3. Cryptographic Isolation: Inboxes are scoped by alias', async () => {
    // 1. Store in 'project-a'
    await worker.fetch(new Request('http://localhost/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': 'mock_sig',
        'X-Payment': 'mock_pay'
      },
      body: JSON.stringify({
        ciphertext: 'data_a',
        durationHours: 1,
        recipientDid: OTHER_DID,
        inboxAlias: 'project-a'
      })
    }), env, createExecutionContext());

    // 2. Query 'project-b' as OTHER_DID
    const inboxBReq = new Request('http://localhost/inbox/project-b', {
      headers: {
        'X-DID': OTHER_DID,
        'X-DID-Signature': 'mock_sig'
      }
    });
    
    const inboxBRes = await worker.fetch(inboxBReq, env, createExecutionContext());
    const dataB: any = await inboxBRes.json();
    expect(dataB.items).toHaveLength(0);

    // 3. Query 'project-a' as OTHER_DID
    const inboxAReq = new Request('http://localhost/inbox/project-a', {
      headers: {
        'X-DID': OTHER_DID,
        'X-DID-Signature': 'mock_sig'
      }
    });
    
    const inboxARes = await worker.fetch(inboxAReq, env, createExecutionContext());
    const dataA: any = await inboxARes.json();
    expect(dataA.items).toHaveLength(1);
  });

  test('4. Temporal Persistence: Data is purged after expiration', async () => {
    // Store with 1 hour duration
    const storeRes = await worker.fetch(new Request('http://localhost/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DID': MY_DID,
        'X-DID-Signature': 'mock_sig',
        'X-Payment': 'mock_pay'
      },
      body: JSON.stringify({
        ciphertext: 'temporary_data',
        durationHours: -1 // Force immediate expiration
      })
    }), env, createExecutionContext());
    
    const { storageId } = await storeRes.json() as any;

    // Attempt retrieval
    const retrieveRes = await worker.fetch(new Request(`http://localhost/retrieve/${storageId}`, {
      headers: {
        'X-DID': MY_DID,
        'X-DID-Signature': 'mock_sig'
      }
    }), env, createExecutionContext());
    
    expect(retrieveRes.status).toBe(410); // Gone/Expired
  });
});
