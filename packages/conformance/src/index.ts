import { runAuthConformanceTests } from './server/auth.test';
import { runEconomicsConformanceTests } from './server/economics.test';
import { runStorageConformanceTests } from './server/storage.test';
import './server/l402.test';
import './server/x402.test';

export interface ConformanceConfig {
  baseUrl: string;
  did: string;
  signRequest: (data: string) => Promise<string>;
}

/**
 * Entry point for the Protocol Conformance Suite.
 */
export function runConformanceSuite(config: ConformanceConfig) {
  runAuthConformanceTests(config);
  runEconomicsConformanceTests(config);
  runStorageConformanceTests(config);
}
