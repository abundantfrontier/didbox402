import { expect, test, describe } from 'vitest';
import { DidBoxClient } from '@didbox/sdk-core';
import { ConformanceConfig } from '../index';

export function runStorageConformanceTests(config: ConformanceConfig) {
  const client = new DidBoxClient({
    ...config,
    autoPay: true
  });

  describe('didbox402: Storage Conformance', () => {
    
    test('Scoped Inbox Isolation', async () => {
       const aliasA = `alias-${Math.random()}`;
       const aliasB = `alias-${Math.random()}`;
       
       await client.store('data', 1, { recipientDid: config.did, inboxAlias: aliasA });
       
       const inboxB = await client.getInbox(aliasB);
       expect(inboxB.items).toHaveLength(0);
    });

    test('Immediate expiration enforcement', async () => {
       // Logic to test expiration
    });
  });
}
