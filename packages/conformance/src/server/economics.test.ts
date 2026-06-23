import { expect, test, describe } from 'vitest';

const baseUrl = process.env.DIDBOX_URL || 'http://localhost:8787';

describe('didbox402: Economics Conformance (v0.9.0)', () => {
  test('Advertises capabilities via .well-known', async () => {
    const res = await fetch(`${baseUrl}/.well-known/didbox-configuration`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty('supported_rails');
    expect(data.protocol_version).toBe('0.9.1');
    expect(data.billing_mode).toBe('micropayment');
    expect(data).toHaveProperty('pricing_mode');
    expect(typeof data.limits?.min_charge_mb).toBe('number');
  });

  test('GET /price is public when pricing_mode is public', async () => {
    const discovery = await fetch(`${baseUrl}/.well-known/didbox-configuration`).then((r) => r.json()) as any;
    if (discovery.pricing_mode !== 'public') {
      return;
    }

    const res = await fetch(`${baseUrl}/price`);
    expect(res.status).toBe(200);
    const price = await res.json() as any;
    expect(price).toHaveProperty('min_charge_mb');
    expect(price).toHaveProperty('base_rate_per_mb_hour');
  });
});