import { describe, test, expect } from 'vitest';
import { authHeaders, storePayload, entitlementUrl, testEntitlementKey } from './helpers';

async function getEntitlementDiscovery() {
  try {
    const res = await fetch(`${entitlementUrl}/.well-known/didbox-configuration`);
    if (!res.ok) return null;
    return res.json() as Promise<Record<string, unknown>>;
  } catch {
    return null;
  }
}

async function entitledFetch(
  path: string,
  init: { method?: string; body?: string; entitlementKey?: string | null } = {}
) {
  const discovery = await getEntitlementDiscovery();
  if (!discovery || discovery.billing_mode !== 'entitlement') {
    return null;
  }

  const method = init.method || 'GET';
  const body = init.body || '';
  const headers = await authHeaders(method, path, body);

  const entitlementKey = init.entitlementKey === null
    ? undefined
    : init.entitlementKey ?? testEntitlementKey;

  if (entitlementKey) {
    headers['X-DIDBOX-Entitlement'] = entitlementKey;
  }

  return fetch(`${entitlementUrl}${path}`, {
    method,
    body: body || undefined,
    headers,
  });
}

describe('didbox402: Enterprise Entitlement Conformance (v0.9.0)', () => {
  test('Discovery advertises entitlement billing mode', async () => {
    const discovery = await getEntitlementDiscovery();
    if (!discovery || discovery.billing_mode !== 'entitlement') {
      return;
    }

    expect(discovery.protocol_version).toBe('0.9.1');
    expect(discovery.billing_mode).toBe('entitlement');
    expect(discovery.supported_rails).toEqual([]);
    expect(discovery.entitlement).toMatchObject({
      methods: ['api_key'],
      header: 'X-DIDBOX-Entitlement',
    });
  });

  test('Unentitled store returns 403 (not 402)', async () => {
    const body = storePayload('no-entitlement');
    const res = await entitledFetch('/store', { method: 'POST', body, entitlementKey: null });
    if (!res) return;

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.code).toBe('ENTITLEMENT_REQUIRED');
  });

  test('Entitled store succeeds without 402', async () => {
    const body = storePayload('entitled-store');
    const res = await entitledFetch('/store', { method: 'POST', body });
    if (!res) return;

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty('storageId');
    expect(data.rail).toBe('entitlement');
    expect(data.amountPaid).toBe('0');
    expect(data.currency).toBe('none');
  });

  test('Invalid entitlement key returns 403', async () => {
    const body = storePayload('bad-key');
    const res = await entitledFetch('/store', {
      method: 'POST',
      body,
      entitlementKey: 'dbx_ent_test.invalid-secret',
    });
    if (!res) return;

    expect(res.status).toBe(403);
  });

  test('Malformed entitlement key returns 403', async () => {
    const body = storePayload('malformed-key');
    const res = await entitledFetch('/store', {
      method: 'POST',
      body,
      entitlementKey: 'not-a-valid-key-format',
    });
    if (!res) return;

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.code).toBe('ENTITLEMENT_REQUIRED');
  });

  test('Entitled inbox creation succeeds without 402', async () => {
    const body = JSON.stringify({ alias: `conf-${Date.now()}` });
    const res = await entitledFetch('/inboxes', { method: 'POST', body });
    if (!res) return;

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.rail).toBe('entitlement');
    expect(data.amountPaid).toBe('0');
    expect(data.currency).toBe('none');
  });

  test('Entitlement node never returns 402 on billable store', async () => {
    const body = storePayload('no-402-check');
    const res = await entitledFetch('/store', { method: 'POST', body, entitlementKey: null });
    if (!res) return;

    expect(res.status).not.toBe(402);
    expect(res.status).toBe(403);
  });

  test('Entitled retrieve succeeds without 402', async () => {
    const storeBody = storePayload('retrieve-base');
    const storeRes = await entitledFetch('/store', { method: 'POST', body: storeBody });
    if (!storeRes) return;
    expect(storeRes.status).toBe(200);

    const { storageId } = await storeRes.json() as { storageId: string };
    const retrieveRes = await entitledFetch(`/retrieve/${storageId}`, { method: 'GET' });
    if (!retrieveRes) return;

    expect(retrieveRes.status).toBe(200);
    expect(retrieveRes.status).not.toBe(402);
    const data = await retrieveRes.json() as any;
    expect(data).toHaveProperty('ciphertext');
  });

  test('Entitled extend succeeds without 402', async () => {
    const storeBody = storePayload('extend-base');
    const storeRes = await entitledFetch('/store', { method: 'POST', body: storeBody });
    if (!storeRes) return;
    expect(storeRes.status).toBe(200);

    const { storageId } = await storeRes.json() as { storageId: string };
    const extendBody = JSON.stringify({ additionalHours: 1 });
    const extendRes = await entitledFetch(`/extend/${storageId}`, {
      method: 'POST',
      body: extendBody,
    });
    if (!extendRes) return;

    expect(extendRes.status).toBe(200);
    const data = await extendRes.json() as any;
    expect(data.rail).toBe('entitlement');
    expect(data.amountPaid).toBe('0');
    expect(data.currency).toBe('none');
  });
});