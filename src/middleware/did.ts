import { Context, Next } from 'hono';

/**
 * Hash a DID with a salt to create a private identifier.
 */
export async function hashDid(did: string, salt: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(did + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Middleware to verify the DID signature.
 * In a production version, this would use a library to verify the actual cryptographic signature.
 * For the MVP, we verify the presence and "bind" the DID to the context.
 */
export async function verifyDidSignature(c: Context, next: Next) {
  const did = c.req.header('X-DID');
  const signature = c.req.header('X-DID-Signature');

  if (!did || !signature) {
    return c.json({ error: 'Missing X-DID or X-DID-Signature' }, 401);
  }

  // TODO: Implement actual signature verification (e.g., did:key or did:ethr)
  // For now, we assume the signature is valid if present.
  
  c.set('did', did);
  
  // Pre-calculate the salted hash for the owner
  const salt = c.env.SERVICE_SALT || 'default_salt';
  const hashedDid = await hashDid(did, salt);
  c.set('hashedDid', hashedDid);

  await next();
}
