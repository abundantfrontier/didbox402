import canonicalize from 'canonicalize';
import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Represents a Migration Authorization (also referred to as a Migration Proof)
 * as returned by a source node's /migrate/{id}/authorize endpoint.
 */
export interface MigrationAuthorization {
  version: number;
  original_storage_id: string;
  owner_did: string;
  size_bytes: number;
  ciphertext_hash: string;
  remaining_lease_hours: number;
  issued_at: string;
  expires_at: string;
  source_node?: string;
  issuance_nonce?: string;
  signature: string;
}

/**
 * Verifies a Migration Authorization using the source node's Ed25519 public key.
 *
 * The function performs the following steps:
 * 1. Strips the `signature` field from the object.
 * 2. Canonicalizes the remaining object using JCS (RFC 8785).
 * 3. Hashes the canonical JSON with SHA-256.
 * 4. Verifies the Ed25519 signature against the hash.
 *
 * @param auth - The MigrationAuthorization object to verify
 * @param nodePublicKey - The Ed25519 public key of the issuing node (raw 32 bytes)
 * @returns true if the signature is valid, false otherwise
 */
export async function verifyMigrationAuthorization(
  auth: MigrationAuthorization,
  nodePublicKey: Uint8Array
): Promise<boolean> {
  try {
    // Create a copy without the signature field for verification
    const { signature, ...authWithoutSignature } = auth;

    // Canonicalize using JSON Canonicalization Scheme (JCS)
    const canonicalJson = canonicalize(authWithoutSignature);
    if (!canonicalJson) {
      return false;
    }

    // Hash the canonical JSON
    const messageHash = sha256(new TextEncoder().encode(canonicalJson));

    // Verify the Ed25519 signature
    const signatureBytes = Buffer.from(signature, 'hex');
    const isValid = await ed.verify(signatureBytes, messageHash, nodePublicKey);

    return isValid;
  } catch (error) {
    // Any unexpected error during verification (bad hex, etc.) results in failure
    return false;
  }
}