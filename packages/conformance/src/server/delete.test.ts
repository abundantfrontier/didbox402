import { expect, test, describe } from 'vitest';

const baseUrl = process.env.DIDBOX_URL || 'http://localhost:8787';

describe('didbox402: Delete Conformance (v0.8.0)', () => {
  test('Discovery advertises delete endpoint', async () => {
    const res = await fetch(`${baseUrl}/.well-known/didbox-configuration`);
    expect(res.status).toBe(200);
    const discovery = await res.json() as any;

    expect(discovery.protocol_version).toBe('0.9.1');
    expect(discovery.endpoints).toHaveProperty('delete');
    expect(discovery.endpoints.delete).toBe('/store/{id}');
    expect(discovery.endpoints?.migrate_authorize).toBeUndefined();
  });

  test('Unauthenticated delete returns 401', async () => {
    const res = await fetch(`${baseUrl}/store/some-id`, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});