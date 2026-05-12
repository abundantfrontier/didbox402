import { expect, test, describe } from 'vitest';
import { DidBoxClient } from '@didbox/sdk-core';

export interface ConformanceConfig {
  baseUrl: string;
  did: string;
  signRequest: (data: string) => Promise<string>;
}

export function runConformanceTests(config: ConformanceConfig) {
  const client = new DidBoxClient({
    ...config,
    autoPay: true
  });

  describe('didbox402 Protocol Conformance', () => {
    
    test('Economic Integrity: Correct 402 rejection', async () => {
      const manualClient = new DidBoxClient({ ...config, autoPay: false });
      try {
        await manualClient.store('test', 1);
        expect.fail('Should have thrown 402');
      } catch (err: any) {
        expect(err.status).toBe(402);
        expect(err.amount).toBeGreaterThan(0);
      }
    });

    test('Cryptographic Isolation: Scoped Inboxes', async () => {
      // 1. Store in alias-a
      await client.store('secret-a', 1, { recipientDid: config.did, inboxAlias: 'alias-a' });

      // 2. Query alias-b
      const inboxB = await client.getInbox('alias-b');
      expect(inboxB.items).toHaveLength(0);

      // 3. Query alias-a
      const inboxA = await client.getInbox('alias-a');
      expect(inboxA.items.length).toBeGreaterThan(0);
    });

    test('Temporal Security: Drift Window', async () => {
       // This test usually requires manually manipulating headers which DidBoxClient abstracts.
       // For a conformance suite, we might need a lower-level request helper.
    });
  });
}
