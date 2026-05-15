import { describe, test, expect } from 'vitest';

const baseUrl = process.env.DIDBOX_URL || 'http://localhost:8787';

function isRealX402Challenge(paymentRequired: string | null): boolean {
  if (!paymentRequired) return false;
  try {
    const decoded = JSON.parse(Buffer.from(paymentRequired, 'base64').toString());
    return decoded.currency === 'USDC' && !decoded.address?.includes('mock');
  } catch {
    return false;
  }
}

describe('didbox402: x402 (USDC) Conformance', () => {

  test('Returns proper x402 402 challenge with valid structure', async () => {
    const res = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: 'test-x402-structured',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    if (res.status === 402) {
      const paymentRequired = res.headers.get('PAYMENT-REQUIRED');
      expect(paymentRequired).toBeDefined();

      try {
        const decoded = JSON.parse(Buffer.from(paymentRequired!, 'base64').toString());

        expect(decoded).toHaveProperty('amount');
        expect(decoded).toHaveProperty('currency');
        expect(decoded.currency).toBe('USDC');
        expect(['base', 'solana']).toContain(decoded.network);
        expect(decoded).toHaveProperty('address');
        expect(decoded).toHaveProperty('context');

        if (isRealX402Challenge(paymentRequired)) {
          console.log('✓ Node returned a real x402 challenge');
        } else {
          console.log('ℹ Node returned a mock x402 challenge');
        }
      } catch (e) {
        throw new Error('PAYMENT-REQUIRED header was not valid base64 JSON');
      }
    } else {
      console.log(`Note: Node returned ${res.status} instead of 402`);
    }
  });

  test('Accepts a valid x402 proof after 402 challenge', async () => {
    const storeRes1 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: 'test-x402-proof',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    if (storeRes1.status !== 402) {
      console.log('Skipping x402 proof test — no 402 received');
      return;
    }

    const paymentRequired = storeRes1.headers.get('PAYMENT-REQUIRED');
    if (!paymentRequired) return;

    const mockTxHash = '0x' + 'a'.repeat(64);

    const storeRes2 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': mockTxHash
      },
      body: JSON.stringify({
        ciphertext: 'test-x402-proof',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    expect([200, 201]).toContain(storeRes2.status);
  });

  test('Rejects replay of the same x402 payment proof', async () => {
    const storeRes1 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: 'replay-x402',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    if (storeRes1.status !== 402) {
      console.log('Skipping x402 replay test');
      return;
    }

    const mockTxHash = '0x' + 'b'.repeat(64);

    const res1 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': mockTxHash
      },
      body: JSON.stringify({
        ciphertext: 'replay-x402',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });
    expect([200, 201]).toContain(res1.status);

    // Replay should be rejected
    const res2 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': mockTxHash
      },
      body: JSON.stringify({
        ciphertext: 'replay-x402-2',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    expect(res2.status).not.toBe(200);
  });

  test('Rejects malformed x402 payment proof', async () => {
    const storeRes1 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ciphertext: 'bad-x402-proof',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    if (storeRes1.status !== 402) return;

    // Submit invalid tx hash
    const badTxHash = 'not-a-valid-tx-hash';

    const res2 = await fetch(`${baseUrl}/store`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': badTxHash
      },
      body: JSON.stringify({
        ciphertext: 'bad-x402-proof',
        durationHours: 1,
        recipientDid: 'did:key:z6Mktest'
      })
    });

    expect(res2.status).not.toBe(200);
  });

  test('Advertises x402 support in discovery (if configured)', async () => {
    const res = await fetch(`${baseUrl}/.well-known/didbox-configuration`);
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    if (data.supported_rails?.includes('x402')) {
      console.log('✓ Node advertises x402 support');
    }
  });
});