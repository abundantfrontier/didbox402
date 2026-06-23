import { expect, test, describe } from 'vitest';

const baseUrl = process.env.DIDBOX_URL || 'http://localhost:8787';

describe('didbox402: Storage Conformance (v0.8.0)', () => {
  test('Public /price responds with JSON', async () => {
    const res = await fetch(`${baseUrl}/price`);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  test('node_identity is optional in discovery', async () => {
    const res = await fetch(`${baseUrl}/.well-known/didbox-configuration`);
    const discovery = await res.json() as any;
    if (discovery.node_identity) {
      expect(discovery.node_identity).toHaveProperty('did');
    }
  });
});