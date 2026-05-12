import { expect, test, describe } from 'vitest';
import { DidBoxClient } from '@didbox/sdk-core';
import { ConformanceConfig } from '../index';

export function runAuthConformanceTests(config: ConformanceConfig) {
  const client = new DidBoxClient({
    ...config,
    autoPay: false
  });

  describe('didbox402: Authentication Conformance', () => {
    
    test('Rejects request with stale timestamp', async () => {
       // Logic to manually craft a stale request
    });

    test('Rejects replayed signature', async () => {
       // Logic to attempt replay
    });

    test('Rejects malformed Multibase DID', async () => {
       // Logic to test DID parsing
    });
  });
}
