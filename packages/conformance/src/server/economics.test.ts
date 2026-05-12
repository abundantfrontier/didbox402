import { expect, test, describe } from 'vitest';
import { DidBoxClient } from '@didbox/sdk-core';

const baseUrl = process.env.DIDBOX_URL || 'http://localhost:8787';

describe('didbox402: Economics Conformance', () => {
  const client = new DidBoxClient({
    baseUrl,
    did: 'did:key:z6Mktest',
    signRequest: async () => 'mock_sig',
    autoPay: false
  });

  test('Advertises capabilities via .well-known', async () => {
    const res = await fetch(`${baseUrl}/.well-known/didbox-configuration`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty('supported_rails');
    expect(data).toHaveProperty('protocol_version');
  });
});
