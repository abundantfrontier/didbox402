import { expect, test, describe } from 'vitest';

const baseUrl = process.env.DIDBOX_URL || 'http://localhost:8787';

describe('didbox402: Authentication Conformance (v0.8.0)', () => {
  test('Public /price is accessible without DID headers when pricing_mode is public', async () => {
    const discovery = await fetch(`${baseUrl}/.well-known/didbox-configuration`).then((r) => r.json()) as any;
    if (discovery.pricing_mode !== 'public') {
      return;
    }

    const res = await fetch(`${baseUrl}/price`);
    expect(res.status).toBe(200);
  });

  test('Protected endpoints reject missing X-DID', async () => {
    const res = await fetch(`${baseUrl}/leases`);
    expect(res.status).toBe(401);
  });
});