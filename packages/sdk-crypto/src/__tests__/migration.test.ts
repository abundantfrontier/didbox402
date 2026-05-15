import { describe, test, expect } from 'vitest';
import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { createKeypair } from '../index';
import { verifyMigrationAuthorization, type MigrationAuthorization } from '../migration';

ed.hashes.sha512 = (msg: Uint8Array) => sha512(msg);

describe('verifyMigrationAuthorization', () => {
  // Helper to create a valid signed MigrationAuthorization for testing
  async function createSignedMigrationAuth(overrides: Partial<MigrationAuthorization> = {}) {
    const keypair = await createKeypair();

    const baseAuth: Omit<MigrationAuthorization, 'signature'> = {
      version: 1,
      original_storage_id: '550e8400-e29b-41d4-a716-446655440000',
      owner_did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2gG6h5v8xF2v1v2v3v',
      size_bytes: 1024 * 1024,
      ciphertext_hash: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      remaining_lease_hours: 48,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
      source_node: 'https://node-a.example.com',
      issuance_nonce: '550e8400-e29b-41d4-a716-446655440001',
      ...overrides,
    };

    // Sign using the same logic as the server (JCS)
    const { default: canonicalize } = await import('canonicalize');
    const canonical = canonicalize(baseAuth);
    const messageHash = sha256(new TextEncoder().encode(canonical!));
    const signatureBytes = await ed.sign(messageHash, keypair.privKey);
    const signature = Buffer.from(signatureBytes).toString('hex');

    // Return only the fields that belong to MigrationAuthorization + the keys for testing
    const authForSigning: MigrationAuthorization = {
      ...baseAuth,
      signature,
    };

    return {
      ...authForSigning,
      privateKey: keypair.privKey,
      publicKey: keypair.pubKey,
    };
  }

  test('returns true for a valid Migration Authorization', async () => {
    const signed = await createSignedMigrationAuth();

    // Reconstruct a clean MigrationAuthorization object (without test-only fields)
    const auth: MigrationAuthorization = {
      version: signed.version,
      original_storage_id: signed.original_storage_id,
      owner_did: signed.owner_did,
      size_bytes: signed.size_bytes,
      ciphertext_hash: signed.ciphertext_hash,
      remaining_lease_hours: signed.remaining_lease_hours,
      issued_at: signed.issued_at,
      expires_at: signed.expires_at,
      source_node: signed.source_node,
      issuance_nonce: signed.issuance_nonce,
      signature: signed.signature,
    };

    const isValid = await verifyMigrationAuthorization(auth, signed.publicKey);
    expect(isValid).toBe(true);
  });

  test('returns false for an invalid signature', async () => {
    const signed = await createSignedMigrationAuth();
    const auth = { ...signed } as MigrationAuthorization;

    // Tamper with the signature
    auth.signature = '00' + auth.signature.slice(2);

    const isValid = await verifyMigrationAuthorization(auth, signed.publicKey);
    expect(isValid).toBe(false);
  });

  test('returns false when data has been tampered with', async () => {
    const signed = await createSignedMigrationAuth();
    const auth = { ...signed } as MigrationAuthorization;

    // Tamper with a field after signing
    auth.remaining_lease_hours = 999;

    const isValid = await verifyMigrationAuthorization(auth, signed.publicKey);
    expect(isValid).toBe(false);
  });

  test('returns false when signature field is missing', async () => {
    const signed = await createSignedMigrationAuth();
    const auth = { ...signed } as any;
    delete auth.signature;

    const isValid = await verifyMigrationAuthorization(auth, signed.publicKey);
    expect(isValid).toBe(false);
  });

  test('returns false when using the wrong public key', async () => {
    const signed = await createSignedMigrationAuth();
    const wrongKeypair = await createKeypair();

    const isValid = await verifyMigrationAuthorization(signed as MigrationAuthorization, wrongKeypair.pubKey);
    expect(isValid).toBe(false);
  });

  test('returns false for completely malformed input', async () => {
    const malformed = {
      version: 1,
      foo: 'bar',
    } as any;

    const isValid = await verifyMigrationAuthorization(malformed, new Uint8Array(32));
    expect(isValid).toBe(false);
  });
});