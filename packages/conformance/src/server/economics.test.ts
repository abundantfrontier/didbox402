import { expect, test, describe } from 'vitest';
import { DidBoxClient } from '@didbox/sdk-core';
import { ConformanceConfig } from '../index';

export function runEconomicsConformanceTests(config: ConformanceConfig) {
  const client = new DidBoxClient({
    ...config,
    autoPay: false
  });

  describe('didbox402: Economics Conformance', () => {
    
    test('Returns 402 Challenge on unpaid store', async () => {
       try {
         await client.store('test', 1);
         expect.fail('Should return 402');
       } catch (err: any) {
         expect(err.status).toBe(402);
         expect(err.challenge).toBeDefined();
       }
    });

    test('Advertises capabilities via .well-known', async () => {
       const res = await fetch(`${config.baseUrl}/.well-known/didbox-configuration`);
       expect(res.status).toBe(200);
       const data = await res.json();
       expect(data).toHaveProperty('supported_rails');
    });
  });
}
