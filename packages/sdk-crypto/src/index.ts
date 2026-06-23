import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import bs58 from 'bs58';

// Setup SHA-512 for noble-ed25519
ed.hashes.sha512 = (msg: Uint8Array) => sha512(msg);

/**
 * Create a new Ed25519 keypair and its corresponding did:key.
 */
export async function createKeypair() {
  const privKey = crypto.getRandomValues(new Uint8Array(32));
  const pubKey = await ed.getPublicKey(privKey);
  
  // did:key:z6Mk...
  // z = base58btc
  // 0xed01 = multicodec for Ed25519 public key
  const multicodec = new Uint8Array([0xed, 0x01]);
  const combined = new Uint8Array(multicodec.length + pubKey.length);
  combined.set(multicodec);
  combined.set(pubKey, multicodec.length);
  
  const did = `did:key:z${bs58.encode(combined)}`;
  return { privKey, pubKey, did };
}

export async function signRequest(privKey: Uint8Array, method: string, path: string, body: string, timestamp: number): Promise<string> {
  const bodyHash = sha256(new TextEncoder().encode(body));
  // Request Hash = SHA256(Timestamp + Method + Path + SHA256(Body))
  const requestHash = sha256(new TextEncoder().encode(`${timestamp}${method}${path}${Buffer.from(bodyHash).toString('hex')}`));
  const signature = await ed.sign(requestHash, privKey);
  return Buffer.from(signature).toString('hex');
}

export async function verifySignature(signature: string, requestHash: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
  const sigBytes = Buffer.from(signature, 'hex');
  return ed.verify(sigBytes, requestHash, publicKey);
}

/**
 * Extract the Ed25519 public key from a standard did:key string.
 */
export function extractPublicKeyFromDid(did: string): Uint8Array {
  if (!did.startsWith('did:key:z')) {
    throw new Error('Only base58btc multibase (did:key:z...) is supported');
  }
  
  const multibase = did.substring(9); // remove 'did:key:z'
  const decoded = bs58.decode(multibase);
  
  // Ed25519 multicodec is 0xed, 0x01
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error('Only Ed25519 (did:key:z6Mk) is supported in v0.2.x');
  }
  
  return decoded.slice(2);
}

/**
 * Convert a raw 32-byte Ed25519 public key into a did:key string (z6Mk...).
 * Used by nodes to publish their node_identity.public_key in a standard format.
 */
export function publicKeyToDidKey(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error('Ed25519 public key must be exactly 32 bytes');
  }
  
  // Ed25519 multicodec prefix: 0xed 0x01
  const prefix = new Uint8Array([0xed, 0x01]);
  const combined = new Uint8Array(prefix.length + publicKey.length);
  combined.set(prefix);
  combined.set(publicKey, prefix.length);
  
  const multibase = bs58.encode(combined);
  return `did:key:z${multibase}`;
}

/**
 * Convert a raw 32-byte Ed25519 public key to its base58btc multibase representation
 * (without the 'did:key:' prefix). This is the value recommended for `node_identity.public_key`.
 */
export function publicKeyToMultibase(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error('Ed25519 public key must be exactly 32 bytes');
  }
  
  const prefix = new Uint8Array([0xed, 0x01]);
  const combined = new Uint8Array(prefix.length + publicKey.length);
  combined.set(prefix);
  combined.set(publicKey, prefix.length);
  
  return bs58.encode(combined);
}
