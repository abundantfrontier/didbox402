import { Context, Next } from 'hono';
import * as ed from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';
import { sha512 } from '@noble/hashes/sha2.js';
import bs58 from 'bs58';

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
 * Extract the Ed25519 public key from a standard did:key string.
 */
function extractPublicKeyFromDid(did: string): Uint8Array {
  if (!did.startsWith('did:key:z')) {
    throw new Error('Only base58btc multibase (did:key:z...) is supported');
  }
  
  const multibase = did.substring(9);
  const decoded = bs58.decode(multibase);
  
  // Ed25519 multicodec is 0xed, 0x01
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error('Only Ed25519 (did:key:z6Mk) is supported');
  }
  
  return decoded.slice(2);
}

/**
 * Middleware to verify the DID signature.
 * Enforces signature binding: Hash(Timestamp + Method + Path + Body_Hash)
 */
export async function verifyDidSignature(c: Context, next: Next) {
  // Discovery endpoint must be public (spec 7.1)
  if (new URL(c.req.url).pathname === '/.well-known/didbox-configuration') {
    return next();
  }

  const did = c.req.header('X-DID');
  const signature = c.req.header('X-DID-Signature');
  const timestampHeader = c.req.header('X-DID-Timestamp');

  if (!did || !signature || !timestampHeader) {
    return c.json({ error: 'Missing X-DID, X-DID-Signature, or X-DID-Timestamp' }, 401);
  }

  // 5-minute drift window
  const timestamp = parseInt(timestampHeader);
  const now = Date.now();
  if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
    return c.json({ error: 'X-DID-Timestamp outside allowed window' }, 401);
  }

  // Nonce tracking (prevent replay of the same signature)
  const existingNonce = await c.env.DB.prepare("SELECT signature FROM nonces WHERE signature = ?").bind(signature).first();
  if (existingNonce) {
    return c.json({ error: 'Replay detected: Signature already used' }, 401);
  }

  // Store nonce (expires when the drift window expires)
  await c.env.DB.prepare("INSERT INTO nonces (signature, expires_at) VALUES (?, ?)")
    .bind(signature, timestamp + 5 * 60 * 1000)
    .run();

  try {
    const publicKey = extractPublicKeyFromDid(did);

    // Compute the Request Hash for Signature Binding
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;
    const bodyText = await c.req.text();

    const bodyHash = sha256(new TextEncoder().encode(bodyText));
    const requestHash = sha256(new TextEncoder().encode(`${timestamp}${method}${path}${Buffer.from(bodyHash).toString('hex')}`));

    const sigBytes = Buffer.from(signature, 'hex');
    const isValid = await ed.verify(sigBytes, requestHash, publicKey);

    if (!isValid) {
      // Only allow mock_sig in explicit DEV_MODE for local testing (per spec 3.2)
      if (signature === 'mock_sig' && c.env.DEV_MODE === 'true') {
        // test bypass only
      } else {
        return c.json({ error: 'Invalid DID Signature' }, 401);
      }
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
