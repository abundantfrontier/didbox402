#!/usr/bin/env node
import { Command } from 'commander';
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const PKG_ROOT = path.resolve(__dirname, '..');
const VERSION: string = JSON.parse(
  readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')
).version;

type Profile = 'core' | 'micropayment' | 'enterprise-internal' | 'all';

const PROFILE_FILES: Record<Profile, string[]> = {
  core: ['auth.test.ts', 'storage.test.ts', 'delete.test.ts', 'economics.test.ts'],
  micropayment: [
    'auth.test.ts',
    'storage.test.ts',
    'delete.test.ts',
    'economics.test.ts',
    'l402.test.ts',
    'x402.test.ts',
    'billing-guard.test.ts',
  ],
  'enterprise-internal': ['entitlement.test.ts'],
  all: [
    'auth.test.ts',
    'storage.test.ts',
    'delete.test.ts',
    'economics.test.ts',
    'l402.test.ts',
    'x402.test.ts',
    'billing-guard.test.ts',
    'entitlement.test.ts',
  ],
};

async function probeDiscovery(url: string) {
  try {
    const res = await fetch(`${url}/.well-known/didbox-configuration`);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveVitestBin(): string {
  const candidates = [
    path.join(PKG_ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
    path.join(PKG_ROOT, '..', '..', 'node_modules', 'vitest', 'vitest.mjs'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error('Could not find vitest. Install dependencies from the monorepo root.');
}

function runVitest(
  files: string[],
  env: NodeJS.ProcessEnv,
  json: boolean
): number {
  const testPaths = files.map((file) => path.join('src', 'server', file));
  const vitestBin = resolveVitestBin();
  const args = ['run', ...testPaths];
  if (json) {
    args.push('--reporter=json');
  }

  const result = spawnSync(process.execPath, [vitestBin, ...args], {
    cwd: PKG_ROOT,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });

  return result.status ?? 1;
}

const program = new Command();

program
  .name('didbox-conformance')
  .description(`Official Protocol Conformance Suite for didbox402 (v${VERSION})`)
  .version(VERSION)
  .requiredOption('-u, --url <url>', 'Base URL of the didbox402 node (micropayment profile)')
  .option(
    '-p, --profile <profile>',
    'Conformance profile: core | micropayment | enterprise-internal | all',
    'micropayment'
  )
  .option(
    '--entitlement-url <url>',
    'Base URL for enterprise-internal profile (default: http://localhost:8788)'
  )
  .option(
    '--entitlement-key <key>',
    'Entitlement API key for enterprise-internal tests (default: dbx_ent_test.conformance-secret)'
  )
  .option('-d, --did <did>', 'Reserved for custom test identity (suite generates its own DID today)')
  .option('-k, --key <key>', 'Reserved for custom test identity (hex Ed25519 private key)')
  .option('-j, --json', 'Use Vitest JSON reporter', false)
  .option('--dry-run', 'Print the selected profile and exit without running tests', false)
  .action(async (options) => {
    const profile = options.profile as Profile;
    if (!PROFILE_FILES[profile]) {
      console.error(`Unknown profile "${options.profile}". Use: core, micropayment, enterprise-internal, all`);
      process.exit(1);
    }

    const env: NodeJS.ProcessEnv = {
      DIDBOX_URL: options.url.replace(/\/$/, ''),
    };

    if (profile === 'enterprise-internal' || profile === 'all') {
      env.DIDBOX_ENTITLEMENT_URL = (options.entitlementUrl || 'http://localhost:8788').replace(/\/$/, '');
      if (options.entitlementKey) {
        env.DIDBOX_ENTITLEMENT_KEY = options.entitlementKey;
      }
    }

    if (!options.json && !options.dryRun) {
      console.log(`\n🚀 didbox402 Conformance Suite v${VERSION}`);
      console.log(`Profile: ${profile}`);
      console.log(`Target: ${env.DIDBOX_URL}`);
      if (env.DIDBOX_ENTITLEMENT_URL) {
        console.log(`Entitlement target: ${env.DIDBOX_ENTITLEMENT_URL}`);
      }
      console.log('');
    }

    const probeUrl =
      profile === 'enterprise-internal' ? env.DIDBOX_ENTITLEMENT_URL! : env.DIDBOX_URL!;

    if (profile !== 'core') {
      const discovery = await probeDiscovery(probeUrl);
      if (!discovery) {
        console.error(`❌ Could not reach discovery at ${probeUrl}/.well-known/didbox-configuration`);
        process.exit(1);
      }
      if (!options.json && !options.dryRun) {
        console.log(`Node protocol_version: ${discovery.protocol_version ?? 'unknown'}`);
        console.log(`Node billing_mode: ${discovery.billing_mode ?? 'micropayment'}`);
        console.log('');
      }
    }

    const files = PROFILE_FILES[profile];

    if (options.dryRun) {
      console.log(JSON.stringify({ profile, files, env }, null, 2));
      return;
    }

    const exitCode = runVitest(files, env, options.json);
    process.exit(exitCode);
  });

program.parse();