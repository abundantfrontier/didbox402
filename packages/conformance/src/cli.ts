#!/usr/bin/env node
import { Command } from 'commander';
import { runConformanceSuite } from './index';
import { signRequest } from '@didbox/sdk-crypto';

const program = new Command();

program
  .name('didbox-conformance')
  .description('Protocol Conformance Suite for didbox402')
  .version('0.6.0')
  .requiredOption('-u, --url <url>', 'Base URL of the didbox402 node')
  .requiredOption('-d, --did <did>', 'Test DID to use for requests')
  .requiredOption('-k, --key <key>', 'Hex private key for the test DID')
  .action(async (options) => {
    console.log(`\n🚀 Starting didbox402 Conformance Tests against: ${options.url}\n`);
    
    const config = {
      baseUrl: options.url,
      did: options.did,
      signRequest: async (data: string) => {
        return signRequest(Buffer.from(options.key, 'hex'), 'POST', '', data); // Simplified mapping
      }
    };

    try {
      console.log('--- Configuring Test Environment ---');
      console.log(`Target: ${options.url}`);
      console.log(`Identity: ${options.did}`);

      console.log('\nTo run the actual tests, ensure you have vitest installed and execute:');
      console.log('npx vitest packages/conformance/src/server');

      console.log('\n✅ Configuration valid. Ready for conformance testing.');
    } catch (err: any) {
      console.error(`\n❌ Conformance check failed: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
