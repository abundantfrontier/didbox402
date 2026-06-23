import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, timingSafeEqual } from './bytes';

const KEY_PATTERN = /^dbx_ent_([a-zA-Z0-9_-]+)\.(.+)$/;

function hashSecret(secret: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(secret)));
}

function parseKeyHashes(config: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!config) return map;

  for (const entry of config.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon <= 0) continue;
    const id = trimmed.slice(0, colon);
    const hash = trimmed.slice(colon + 1).toLowerCase();
    map.set(id, hash);
  }

  return map;
}

/**
 * Verify X-DIDBOX-Entitlement API key (Phase 1).
 * Keys use format: dbx_ent_<id>.<secret>
 * Server stores SHA-256(secret) per id in ENTITLEMENT_KEY_HASHES.
 */
export async function verifyEntitlement(c: any): Promise<boolean> {
  const header = c.req.header('X-DIDBOX-Entitlement');
  if (!header) return false;

  const match = header.match(KEY_PATTERN);
  if (!match) return false;

  const id = match[1];
  const secret = match[2];
  const configured = parseKeyHashes(c.env.ENTITLEMENT_KEY_HASHES || '');
  const expectedHash = configured.get(id);
  if (!expectedHash) return false;

  return timingSafeEqual(hashSecret(secret), expectedHash);
}

export function hasConfiguredEntitlementKeys(env: { ENTITLEMENT_KEY_HASHES?: string }): boolean {
  return parseKeyHashes(env.ENTITLEMENT_KEY_HASHES || '').size > 0;
}