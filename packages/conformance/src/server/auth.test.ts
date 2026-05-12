import { expect, test, describe, beforeAll } from 'vitest';
import { DidBoxClient } from '@didbox/sdk-core';

// This file is designed to be run against a configurable endpoint
// For the local monorepo tests, we use the reference node URL.
const baseUrl = process.env.DIDBOX_URL || 'http://localhost:8787';

describe('didbox402: Authentication Conformance', () => {
  const client = new DidBoxClient({
    baseUrl,
    did: 'did:key:z6Mktest',
    signRequest: async () => 'mock_sig',
    autoPay: false
  });

  test('Rejects request with missing X-DID', async () => {
    const res = await fetch(`${baseUrl}/price`);
    expect(res.status).toBe(401);
  });
});
