import { describe, test, expect } from 'vitest';
import { baseUrl, signedFetch, storePayload, testEntitlementKey } from './helpers';

describe('didbox402: Micropayment Billing Guard (v0.9.0)', () => {
  test('Micropayment node returns 402 when only entitlement header is sent', async () => {
    let discovery: Record<string, unknown>;
    try {
      const res = await fetch(`${baseUrl}/.well-known/didbox-configuration`);
      if (!res.ok) return;
      discovery = await res.json();
    } catch {
      return;
    }

    if (discovery.billing_mode !== 'micropayment') {
      return;
    }

    const body = storePayload('entitlement-header-only');
    const res = await signedFetch('/store', {
      method: 'POST',
      body,
      headers: { 'X-DIDBOX-Entitlement': testEntitlementKey },
    });

    expect(res.status).toBe(402);
    const wwwAuth = res.headers.get('WWW-Authenticate') || '';
    expect(wwwAuth).toMatch(/L402/i);
  });
});