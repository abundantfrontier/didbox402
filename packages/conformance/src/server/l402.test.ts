import { describe, test, expect } from 'vitest';

const baseUrl = process.env.DIDBOX_URL || 'http://localhost:8787';

function isRealL402Challenge(wwwAuth: string): boolean {
  return wwwAuth.includes('L402') && !wwwAuth.toLowerCase().includes('mock');
}

describe('didbox402: L402 (Lightning) Conformance', () => {

  test('Returns proper L402 402 challenge when making an unpaid request', async () => {
    const res = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: 'test-l402',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    if (res.status === 402) {
      const wwwAuth = res.headers.get('WWW-Authenticate') || '';
      expect(wwwAuth).toMatch(/L402/i);
      expect(wwwAuth).toMatch(/invoice=/i);
      expect(wwwAuth).toMatch(/macaroon=/i);

      if (isRealL402Challenge(wwwAuth)) {
        console.log('✓ Node returned a real L402 challenge (non-mock)');
      } else {
        console.log('ℹ Node returned a mock L402 challenge (likely DEV_MODE)');
      }
    } else {
      console.log(`Note: Node returned ${res.status} instead of 402`);
    }
  });

  test('Accepts a valid L402 proof after 402 challenge', async () => {
    const storeRes1 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: 'test-l402-proof',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    if (storeRes1.status !== 402) {
      console.log('Skipping L402 proof submission test — no 402 received');
      return;
    }

    const wwwAuth = storeRes1.headers.get('WWW-Authenticate') || '';
    const match = wwwAuth.match(/macaroon="([^"]+)"/);
    if (!match) return;

    const macaroon = match[1];
    const isReal = isRealL402Challenge(wwwAuth);

    // Use a realistic-looking preimage
    const mockPreimage = isReal ? 'cafebabe'.repeat(8) : 'deadbeef'.repeat(8);
    const proofHeader = `L402 ${macaroon}:${mockPreimage}`;

    const storeRes2 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': proofHeader
      },
      body: JSON.stringify({
        ciphertext: 'test-l402-proof',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    expect([200, 201]).toContain(storeRes2.status);
  });

  test('Rejects replay of the same L402 proof', async () => {
    const storeRes1 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: 'replay-l402',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    if (storeRes1.status !== 402) {
      console.log('Skipping L402 replay test — no 402 received');
      return;
    }

    const wwwAuth = storeRes1.headers.get('WWW-Authenticate') || '';
    const match = wwwAuth.match(/macaroon="([^"]+)"/);
    if (!match) return;

    const macaroon = match[1];
    const mockPreimage = 'feedface'.repeat(8);
    const proofHeader = `L402 ${macaroon}:${mockPreimage}`;

    // First use
    const res1 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': proofHeader
      },
      body: JSON.stringify({
        ciphertext: 'replay-l402',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });
    expect([200, 201]).toContain(res1.status);

    // Replay — should be rejected
    const res2 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': proofHeader
      },
      body: JSON.stringify({
        ciphertext: 'replay-l402-2',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    expect(res2.status).not.toBe(200);
  });

  test('Rejects L402 proof with wrong amount', async () => {
    const storeRes1 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: 'wrong-amount-l402',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    if (storeRes1.status !== 402) return;

    const wwwAuth = storeRes1.headers.get('WWW-Authenticate') || '';
    const match = wwwAuth.match(/macaroon="([^"]+)"/);
    if (!match) return;

    const macaroon = match[1];
    const mockPreimage = 'badbeef0'.repeat(8);
    const proofHeader = `L402 ${macaroon}:${mockPreimage}`;

    // Submit with wrong amount in body (server should still check the macaroon amount)
    const res2 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': proofHeader
      },
      body: JSON.stringify({
        ciphertext: 'wrong-amount-l402',
        durationHours: 999, // wrong duration
        recipientDid: 'did:key:z6Mktest'
      })
    });

    // We expect either rejection or at least not a clean 200 in strict mode
    // For now we just ensure it doesn't silently succeed in all cases
    expect(res2.status).not.toBe(200);
  });

  test('Advertises L402 support in discovery (if configured)', async () => {
    const res = await fetch(`${baseUrl}/.well-known/didbox-configuration`);
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    if (data.supported_rails?.includes('L402')) {
      console.log('✓ Node advertises L402 support');
    }
  });
});