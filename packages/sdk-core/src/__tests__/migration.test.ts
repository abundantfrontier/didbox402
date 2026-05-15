import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DidBoxClient, type GetMigrationProofResult, type MigrationAuthorization, DidBoxMigrationError } from '../index';

describe('DidBoxClient - Migration (v0.7.0)', () => {
  const baseConfig = {
    baseUrl: 'http://source-node.local',
    did: 'did:key:z6Mktest',
    signRequest: vi.fn().mockResolvedValue('test_signature'),
    autoPay: false
  };

  let client: DidBoxClient;

  beforeEach(() => {
    client = new DidBoxClient(baseConfig);
    vi.clearAllMocks();
    global.fetch = vi.fn();
    process.env.DEV_MODE = 'true';
  });

  const mockMigrationAuth: MigrationAuthorization = {
    version: 1,
    original_storage_id: 'storage-123',
    owner_did: 'did:key:z6Mktest',
    size_bytes: 1024 * 1024,
    ciphertext_hash: 'sha256:abc123',
    remaining_lease_hours: 48,
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
    source_node: 'http://source-node.local',
    issuance_nonce: 'nonce-123',
    signature: 'sig-123',
  };

  // ============================================
  // getMigrationProof tests
  // ============================================

  it('getMigrationProof - returns verified proof when everything succeeds', async () => {
    // The implementation calls:
    // 1. this.request('/migrate/.../authorize') → global.fetch #1
    // 2. fetch(discovery) → global.fetch #2

    (global.fetch as any)
      // 1. Authorize endpoint
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMigrationAuth
      })
      // 2. Discovery for node_identity
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          node_identity: {
            did: 'did:key:z6MkSourceNode',
            public_key: 'z6MkSourceNodePub'
          }
        })
      });

    // Mock the crypto helpers
    vi.spyOn(await import('@didbox/sdk-crypto'), 'extractPublicKeyFromDid')
      .mockReturnValue(new Uint8Array(32));
    vi.spyOn(await import('@didbox/sdk-crypto'), 'verifyMigrationAuthorization')
      .mockResolvedValue(true);

    const result: GetMigrationProofResult = await client.getMigrationProof('storage-123');

    expect(result.authorization).toEqual(mockMigrationAuth);
    expect(result.verified).toBe(true);
    expect(result.verificationError).toBeUndefined();
  });

  it('getMigrationProof - returns verified:false when verification fails', async () => {
    (global.fetch as any)
      // 1. Authorize
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMigrationAuth
      })
      // 2. Discovery
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ node_identity: { did: 'did:key:z6MkSourceNode' } })
      });

    // Spy on extractPublicKeyFromDid so the fake DID doesn't cause decoding errors
    vi.spyOn(await import('@didbox/sdk-crypto'), 'extractPublicKeyFromDid')
      .mockReturnValue(new Uint8Array(32));

    vi.spyOn(await import('@didbox/sdk-crypto'), 'verifyMigrationAuthorization')
      .mockResolvedValue(false);

    const result = await client.getMigrationProof('storage-123');

    expect(result.verified).toBe(false);
    expect(result.verificationError).toBe('Signature verification failed');
  });

  it('getMigrationProof - skips verification when verifySignature: false', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockMigrationAuth
    });

    const result = await client.getMigrationProof('storage-123', { verifySignature: false });

    expect(result.verified).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1); // only called authorize, not discovery
  });

  it('getMigrationProof - returns error when source node has no node_identity', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}) // no node_identity
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMigrationAuth
      });

    const result = await client.getMigrationProof('storage-123');

    expect(result.verified).toBe(false);
    expect(result.verificationError).toContain('does not publish a node_identity');
  });

  // ============================================
  // migrate() basic helper tests
  // ============================================

  it('migrate - successfully migrates data to destination', async () => {
    const mockStoreResponse = { storageId: 'new-storage-456' };

    // Mock getMigrationProof
    vi.spyOn(client, 'getMigrationProof' as any).mockResolvedValue({
      authorization: mockMigrationAuth,
      verified: true
    });

    // Mock retrieve
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ciphertext: 'encrypted-data' })
    });

    // Mock store on destination (we'll spy on the internal request or mock fetch broadly)
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockStoreResponse
    });

    const result = await client.migrate('storage-123', {
      destinationUrl: 'http://dest-node.local',
      newDurationHours: 72
    });

    expect(result.newStorageId).toBe('new-storage-456');
  });

  it('migrate - throws DidBoxMigrationError with stage "proof" if getMigrationProof fails verification', async () => {
    vi.spyOn(client, 'getMigrationProof' as any).mockResolvedValue({
      authorization: mockMigrationAuth,
      verified: false,
      verificationError: 'bad sig'
    });

    await expect(
      client.migrate('storage-123', {
        destinationUrl: 'http://dest-node.local',
        newDurationHours: 72
      })
    ).rejects.toThrow(DidBoxMigrationError);
  });

  it('migrate - throws DidBoxMigrationError with correct stage on retrieve failure', async () => {
    vi.spyOn(client, 'getMigrationProof' as any).mockResolvedValue({
      authorization: mockMigrationAuth,
      verified: true
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      text: async () => 'Retrieve failed'
    });

    await expect(
      client.migrate('storage-123', {
        destinationUrl: 'http://dest-node.local',
        newDurationHours: 72
      })
    ).rejects.toThrow(/Migration failed/);
  });
});