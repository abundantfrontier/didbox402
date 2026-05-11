import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2.js';

// Setup SHA-512 for noble-ed25519
ed.hashes.sha512 = (msg: Uint8Array) => sha512(msg);

export async function createKeypair() {
  const privKey = crypto.getRandomValues(new Uint8Array(32));
  const pubKey = await ed.getPublicKey(privKey);
  const did = `did:key:z6Mk${Buffer.from(pubKey).toString('base64')}`;
  return { privKey, pubKey, did };
}

export async function signRequest(privKey: Uint8Array, method: string, path: string, body: string): Promise<string> {
  const bodyHash = sha256(new TextEncoder().encode(body));
  const requestHash = sha256(new TextEncoder().encode(`${method}${path}${Buffer.from(bodyHash).toString('hex')}`));
  const signature = await ed.sign(requestHash, privKey);
  return Buffer.from(signature).toString('hex');
}

export async function verifySignature(signature: string, requestHash: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
  const sigBytes = Buffer.from(signature, 'hex');
  return ed.verify(sigBytes, requestHash, publicKey);
}

export function extractPublicKeyFromDid(did: string): Uint8Array {
  if (!did.startsWith('did:key:z6Mk')) {
    throw new Error('Only Ed25519 (did:key:z6Mk) is supported');
  }
  return Buffer.from(did.substring(12), 'base64');
}
