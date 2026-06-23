import { describe, test, expect } from 'vitest';
import { baseUrl, signedFetch, storePayload } from './helpers';

function uniqueMockTxHash(seed: string): string {
  const hex = `${Date.now().toString(16)}${Array.from(seed)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')}`.padEnd(64, '0').slice(0, 64);
  return `0x${hex}`;
}

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
    const body = storePayload('test-x402-structured');
    const res = await signedFetch('/store', { method: 'POST', body });

    expect(res.status).toBe(402);

    const paymentRequired = res.headers.get('PAYMENT-REQUIRED');
    expect(paymentRequired).toBeDefined();

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
  });

  test('Accepts a valid x402 proof after 402 challenge', async () => {
    const body = storePayload('test-x402-proof');
    const storeRes1 = await signedFetch('/store', { method: 'POST', body });
    expect(storeRes1.status).toBe(402);

    const mockTxHash = uniqueMockTxHash('proof');

    const storeRes2 = await signedFetch('/store', {
      method: 'POST',
      body,
      headers: { 'PAYMENT-SIGNATURE': mockTxHash },
    });

    expect(storeRes2.status).toBe(200);
  });

  test('Rejects replay of the same x402 payment proof', async () => {
    const body1 = storePayload('replay-x402');
    const storeRes1 = await signedFetch('/store', { method: 'POST', body: body1 });
    expect(storeRes1.status).toBe(402);

    const mockTxHash = uniqueMockTxHash('replay');

    const res1 = await signedFetch('/store', {
      method: 'POST',
      body: body1,
      headers: { 'PAYMENT-SIGNATURE': mockTxHash },
    });
    expect(res1.status).toBe(200);

    const body2 = storePayload('replay-x402-2');
    const res2 = await signedFetch('/store', {
      method: 'POST',
      body: body2,
      headers: { 'PAYMENT-SIGNATURE': mockTxHash },
    });

    expect(res2.status).toBe(402);
  });

  test('Rejects malformed x402 payment proof', async () => {
    const body = storePayload('bad-x402-proof');
    const storeRes1 = await signedFetch('/store', { method: 'POST', body });
    expect(storeRes1.status).toBe(402);

    const res2 = await signedFetch('/store', {
      method: 'POST',
      body,
      headers: { 'PAYMENT-SIGNATURE': 'not-a-valid-tx-hash' },
    });

    expect(res2.status).toBe(402);
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