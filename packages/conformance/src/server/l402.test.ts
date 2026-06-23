import { describe, test, expect } from 'vitest';
import { baseUrl, signedFetch, storePayload } from './helpers';

function isRealL402Challenge(wwwAuth: string): boolean {
  return wwwAuth.includes('L402') && !wwwAuth.toLowerCase().includes('mock');
}

function l402ProofFromChallenge(wwwAuth: string): string | null {
  const match = wwwAuth.match(/macaroon="([^"]+)"/);
  if (!match) return null;

  const macaroon = match[1];
  try {
    const decoded = JSON.parse(Buffer.from(macaroon, 'base64').toString());
    if (decoded._mock_preimage) {
      return `L402 ${macaroon}:${decoded._mock_preimage}`;
    }
  } catch {
    // fall through
  }

  return `L402 ${macaroon}:${'deadbeef'.repeat(8)}`;
}

describe('didbox402: L402 (Lightning) Conformance', () => {
  test('Returns proper L402 402 challenge when making an unpaid request', async () => {
    const body = storePayload('test-l402');
    const res = await signedFetch('/store', { method: 'POST', body });

    expect(res.status).toBe(402);

    const wwwAuth = res.headers.get('WWW-Authenticate') || '';
    expect(wwwAuth).toMatch(/L402/i);
    expect(wwwAuth).toMatch(/invoice=/i);
    expect(wwwAuth).toMatch(/macaroon=/i);

    if (isRealL402Challenge(wwwAuth)) {
      console.log('✓ Node returned a real L402 challenge (non-mock)');
    } else {
      console.log('ℹ Node returned a mock L402 challenge (likely DEV_MODE)');
    }
  });

  test('Accepts a valid L402 proof after 402 challenge', async () => {
    const body = storePayload('test-l402-proof');
    const storeRes1 = await signedFetch('/store', { method: 'POST', body });
    expect(storeRes1.status).toBe(402);

    const wwwAuth = storeRes1.headers.get('WWW-Authenticate') || '';
    const proofHeader = l402ProofFromChallenge(wwwAuth);
    expect(proofHeader).toBeTruthy();

    const storeRes2 = await signedFetch('/store', {
      method: 'POST',
      body,
      headers: { Authorization: proofHeader! },
    });

    expect(storeRes2.status).toBe(200);
  });

  test('Rejects replay of the same L402 proof', async () => {
    const body1 = storePayload('replay-l402');
    const storeRes1 = await signedFetch('/store', { method: 'POST', body: body1 });
    expect(storeRes1.status).toBe(402);

    const proofHeader = l402ProofFromChallenge(storeRes1.headers.get('WWW-Authenticate') || '');
    expect(proofHeader).toBeTruthy();

    const res1 = await signedFetch('/store', {
      method: 'POST',
      body: body1,
      headers: { Authorization: proofHeader! },
    });
    expect(res1.status).toBe(200);

    const body2 = storePayload('replay-l402-2');
    const res2 = await signedFetch('/store', {
      method: 'POST',
      body: body2,
      headers: { Authorization: proofHeader! },
    });

    expect(res2.status).toBe(402);
  });

  test('Rejects L402 proof with wrong amount', async () => {
    const body1 = storePayload('wrong-amount-l402', 1);
    const storeRes1 = await signedFetch('/store', { method: 'POST', body: body1 });
    expect(storeRes1.status).toBe(402);

    const proofHeader = l402ProofFromChallenge(storeRes1.headers.get('WWW-Authenticate') || '');
    expect(proofHeader).toBeTruthy();

    const body2 = storePayload('wrong-amount-l402', 999);
    const res2 = await signedFetch('/store', {
      method: 'POST',
      body: body2,
      headers: { Authorization: proofHeader! },
    });

    expect(res2.status).toBe(402);
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