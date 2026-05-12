import { runAuthConformanceTests } from './server/auth.test';
import { runEconomicsConformanceTests } from './server/economics.test';
import { runStorageConformanceTests } from './server/storage.test';

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
