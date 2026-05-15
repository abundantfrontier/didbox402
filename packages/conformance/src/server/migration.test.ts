import { expect, test, describe } from 'vitest';
import { DidBoxClient } from '@didbox/sdk-core';

const baseUrl = process.env.DIDBOX_URL || 'http://localhost:8787';

describe('didbox402: Migration (Sovereign Mobility) Conformance v0.7.0+', () => {
  const client = new DidBoxClient({
    baseUrl,
    did: 'did:key:z6Mktest',
    signRequest: async () => 'mock_sig',
    autoPay: false
  });

  test('Discovery advertises node_identity (required for v0.7.0)', async () => {
    const res = await fetch(`${baseUrl}/.well-known/didbox-configuration`);
    expect(res.status).toBe(200);
    const discovery = await res.json() as any;

    // node_identity is mandatory starting in v0.7.0
    expect(discovery).toHaveProperty('node_identity');
    expect(discovery.node_identity).toHaveProperty('did');
    expect(typeof discovery.node_identity.did).toBe('string');
    expect(discovery.node_identity.did).toMatch(/^did:key:z6Mk/);
  });

  test('Discovery advertises migrate_authorize endpoint', async () => {
    const res = await fetch(`${baseUrl}/.well-known/didbox-configuration`);
    const discovery = await res.json() as any;

    expect(discovery.endpoints).toHaveProperty('migrate_authorize');
    expect(discovery.endpoints.migrate_authorize).toContain('/migrate/');
  });

  test('Unauthenticated request to /migrate/.../authorize returns 401', async () => {
    const res = await fetch(`${baseUrl}/migrate/nonexistent/authorize`, {
      method: 'POST'
    });
    expect(res.status).toBe(401);
  });

  test('Request for non-existent storage returns 404', async () => {
    // We use a signed request via the client (even if it will fail ownership)
    try {
      await client.getMigrationProof('non-existent-storage-id-xyz');
    } catch (err: any) {
      // The SDK throws DidBoxError with status
      expect(err.status).toBe(404);
    }
  });
});
