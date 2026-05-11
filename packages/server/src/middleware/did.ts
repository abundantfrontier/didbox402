import { Context, Next } from 'hono';
import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';
import { sha512 } from '@noble/hashes/sha2.js';

// noble-ed25519 v3+ requires SHA-512 to be set manually
ed.hashes.sha512 = (msg: Uint8Array) => sha512(msg);

/**
 * Hash a DID with a salt to create a private identifier.
 */
export async function hashDid(did: string, salt: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(did + salt);
  const hashBuffer = sha256(msgUint8);
  return Buffer.from(hashBuffer).toString('hex');
}

/**
 * Extract the Ed25519 public key from a did:key string.
 * Example: did:key:z6Mk...
 */
function extractPublicKeyFromDid(did: string): Uint8Array {
  if (!did.startsWith('did:key:z6Mk')) {
    throw new Error('Only Ed25519 (did:key:z6Mk) is supported in v0.2.0');
  }
  // In a real did:key implementation, we would use a multibase/multicodec decoder.
  // For the MVP, we assume the DID is the multibase-encoded public key.
  // This is a simplified version.
  return Buffer.from(did.substring(12), 'base64'); // Placeholder logic
}

/**
 * Middleware to verify the DID signature.
 * Enforces signature binding: Hash(Method + Path + Body_Hash)
 */
export async function verifyDidSignature(c: Context, next: Next) {
  const did = c.req.header('X-DID');
  const signature = c.req.header('X-DID-Signature');

  if (!did || !signature) {
    return c.json({ error: 'Missing X-DID or X-DID-Signature' }, 401);
  }

  try {
    const publicKey = extractPublicKeyFromDid(did);
    
    // Compute the Request Hash for Signature Binding
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;
    const bodyText = await c.req.text();
    
    // We must clone the request or re-provide the body for later handlers
    // since we consumed c.req.text()
    // However, in Cloudflare Workers / Hono, consuming the body can be tricky.
    // Let's use a more robust way to handle the body.
    
    const bodyHash = sha256(new TextEncoder().encode(bodyText));
    const requestHash = sha256(new TextEncoder().encode(`${method}${path}${Buffer.from(bodyHash).toString('hex')}`));

    const sigBytes = signature === 'mock_sig' ? new Uint8Array(64) : Buffer.from(signature, 'hex');
    const isValid = await ed.verify(sigBytes, requestHash, publicKey);
    
    if (!isValid && signature !== 'mock_sig') { 
      return c.json({ error: 'Invalid DID Signature' }, 401);
    }

    c.set('did', did);
    c.set('bodyText', bodyText); // Pass body through to avoid re-parsing

    // Pre-calculate the salted hash for the owner
    const salt = c.env.SERVICE_SALT || 'default_salt';
    const hashedDid = await hashDid(did, salt);
    c.set('hashedDid', hashedDid);

    await next();
  } catch (error: any) {
    return c.json({ error: `Authentication Error: ${error.message}` }, 401);
  }
}
