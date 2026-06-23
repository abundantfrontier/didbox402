import { describe, test, expect } from 'vitest';
import { verifyEntitlement, hasConfiguredEntitlementKeys } from '../lib/entitlement';
import { timingSafeEqual } from '../lib/bytes';

const TEST_HASH = 'd0d18cc0999e75e555481aad963ba46c6b8c8643a4f2cc8909d0a7dbcaa3f8d1';

function mockContext(entitlementHeader?: string) {
  return {
    env: {
      ENTITLEMENT_KEY_HASHES: `test:${TEST_HASH}`,
    },
    req: {
      header: (name: string) => (name === 'X-DIDBOX-Entitlement' ? entitlementHeader : undefined),
    },
  };
}

describe('verifyEntitlement', () => {
  test('accepts a valid api key', async () => {
    const ok = await verifyEntitlement(mockContext('dbx_ent_test.conformance-secret'));
    expect(ok).toBe(true);
  });

  test('rejects missing header', async () => {
    expect(await verifyEntitlement(mockContext())).toBe(false);
  });

  test('rejects malformed key format', async () => {
    expect(await verifyEntitlement(mockContext('not-a-key'))).toBe(false);
  });

  test('rejects wrong secret', async () => {
    expect(await verifyEntitlement(mockContext('dbx_ent_test.wrong-secret'))).toBe(false);
  });

  test('uses constant-time hash comparison', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });

  test('hasConfiguredEntitlementKeys detects configured hashes', () => {
    expect(hasConfiguredEntitlementKeys({ ENTITLEMENT_KEY_HASHES: `test:${TEST_HASH}` })).toBe(true);
    expect(hasConfiguredEntitlementKeys({})).toBe(false);
    expect(hasConfiguredEntitlementKeys({ ENTITLEMENT_KEY_HASHES: '' })).toBe(false);
  });

  test('rejects unknown key id', async () => {
    const ctx = {
      env: { ENTITLEMENT_KEY_HASHES: `other:${TEST_HASH}` },
      req: { header: () => 'dbx_ent_test.conformance-secret' },
    };
    expect(await verifyEntitlement(ctx)).toBe(false);
  });
});