import { createKeypair, signRequest } from '@didbox/sdk-crypto';

export const baseUrl = process.env.DIDBOX_URL || 'http://localhost:8787';
export const entitlementUrl = process.env.DIDBOX_ENTITLEMENT_URL || 'http://localhost:8788';
export const testEntitlementKey = process.env.DIDBOX_ENTITLEMENT_KEY || 'dbx_ent_test.conformance-secret';

let testIdentity: { privKey: Uint8Array; did: string } | null = null;

async function getTestIdentity() {
  if (!testIdentity) {
    const { privKey, did } = await createKeypair();
    testIdentity = { privKey, did };
  }
  return testIdentity;
}

export function toCiphertext(plain: string): string {
  return Buffer.from(plain).toString('base64');
}

export function storePayload(plain: string, durationHours = 1) {
  return JSON.stringify({
    ciphertext: toCiphertext(plain),
    durationHours,
    recipientDid: 'did:key:z6Mktest',
  });
}

export async function authHeaders(method: string, path: string, body: string) {
  const { privKey, did } = await getTestIdentity();
  const timestamp = Date.now();
  const signature = await signRequest(privKey, method, path, body, timestamp);
  return {
    'Content-Type': 'application/json',
    'X-DID': did,
    'X-DID-Signature': signature,
    'X-DID-Timestamp': String(timestamp),
  };
}

export async function signedFetch(
  path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {}
) {
  const method = init.method || 'GET';
  const body = init.body || '';
  const headers = await authHeaders(method, path, body);
  return fetch(`${baseUrl}${path}`, {
    method,
    body: body || undefined,
    headers: { ...headers, ...init.headers },
  });
}