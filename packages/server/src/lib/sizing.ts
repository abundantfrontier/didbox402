import { base64Decode } from './bytes';

/**
 * Decode base64 ciphertext and return storage byte length.
 * Returns null if the value is not valid base64.
 */
export function storageBytesFromCiphertext(ciphertext: string): number | null {
  if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
    return null;
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext)) {
    return null;
  }

  try {
    const decoded = base64Decode(ciphertext);
    if (decoded.length === 0) {
      return null;
    }
    return decoded.length;
  } catch {
    return null;
  }
}

/** Octets in the HTTP response body for a retrieve payload. */
export function transferBytesFromRetrieveBody(ciphertext: string): number {
  return new TextEncoder().encode(JSON.stringify({ ciphertext })).length;
}