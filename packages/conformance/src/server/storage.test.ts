import { expect, test, describe } from 'vitest';
import { DidBoxClient } from '@didbox/sdk-core';

const baseUrl = process.env.DIDBOX_URL || 'http://localhost:8787';

describe('didbox402: Storage Conformance', () => {
  const client = new DidBoxClient({
    baseUrl,
    did: 'did:key:z6Mktest',
    signRequest: async () => 'mock_sig',
    autoPay: true
  });

  test('Public endpoint responds with JSON', async () => {
     const res = await fetch(`${baseUrl}/price`);
     expect(res.headers.get('content-type')).toContain('application/json');
  });
});
