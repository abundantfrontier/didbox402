# Testing didbox402

This document explains how to run and interpret tests for the didbox402 reference implementation and conformance suite.

## Test Philosophy

didbox402 has two layers of testing:

1. **Internal Unit & Integration Tests** (`packages/server`, `packages/sdk-*`)
   - Located in each package under `__tests__/`
   - Use Vitest + `@cloudflare/vitest-pool-workers`
   - These tests are **useful during development** but have known limitations in CI / automated environments.

2. **Conformance Suite** (`packages/conformance`)
   - This is the **authoritative** way to validate a didbox402 implementation.
   - Can run against the reference server or any third-party node.
   - Recommended for releases, CI, and external implementers.

## Running Internal Tests

```bash
# From the root
npm test

# Or run a specific package
cd packages/server && npm test
cd packages/sdk-core && npm test
cd packages/sdk-crypto && npm test
```

### Known Limitations

The server tests use Cloudflare's official Workers testing pool (`@cloudflare/vitest-pool-workers`). This environment has **significant flakiness**:

- Frequent `ERR_RUNTIME_FAILURE`, connection refused errors, and worker crashes.
- Inconsistent behavior between runs, even with identical code.
- Slow startup and high resource usage.

Because of this, **many tests may fail intermittently** even when the underlying code is correct.

### Recommended Approach

- Use internal tests for rapid local iteration.
- Do **not** rely solely on them for release validation.
- Always run the conformance suite before cutting a release or claiming protocol compliance.

## Running the Conformance Suite (Recommended)

```bash
# Against local dev server
cd packages/server && npx wrangler dev

# In another terminal
npx @didbox/conformance --url http://localhost:8787 --did "did:key:..." --signer ./path/to/signer.js
```

Or using the raw Vitest runner:

```bash
npx vitest run packages/conformance/src/server
```

### Real Payment Provider Mode

The conformance suite can run against **real** L402 (Alby) and x402 (Base USDC) providers when the following environment variables are set:

- `ALBY_API_KEY`
- `USDC_RPC_URL`
- `USDC_WALLET_ADDRESS`

When these are present, the CLI will print:

> "Running with Real Payment Providers"

This is the mode used for official v0.8.0+ validation.

### Conformance Profiles (v0.9.1)

| Profile | Scope |
|---------|--------|
| `core` | Auth, storage, delete, economics, discovery |
| `rail:L402` | L402 challenge + settlement (when advertised) |
| `rail:x402` | x402 challenge + settlement (when advertised) |
| `enterprise-internal` | Entitlement billing (`billing_mode: entitlement`); requires entitlement dev server |
| `billing-guard` | Micropayment nodes reject entitlement-only bypass (402, not 200) |

**Enterprise-internal profile** (optional):

```bash
# Terminal 1 — micropayment node (default)
cd packages/server && npm run dev

# Terminal 2 — entitlement node
cd packages/server && npm run dev:entitlement

# Terminal 3 — conformance (entitlement tests auto-skip if :8788 is down)
npm test
```

Test key for local entitlement server: `dbx_ent_test.conformance-secret`

Nodes advertising `supported_rails: ["x402"]` only are fully conformant when all `core` + `rail:x402` tests pass.

## Test Coverage Expectations

| Area                        | Internal Tests      | Conformance Suite      | Notes |
|----------------------------|---------------------|------------------------|-------|
| Authentication & Signatures | Partial             | Strong                 | Nonce + timestamp binding |
| Payment Rails (L402 + x402) | Partial             | Strong                 | Real providers supported |
| Replay Protection           | Partial             | Strong                 | Both auth nonces + `used_payments` |
| Owner Delete (v0.8.0+)      | Good                | Basic                  | `DELETE /store/{id}` |
| Economic Integrity          | Good                | Strong                 | `storageBytes` / `transferBytes` + operator `min_charge_mb` |
| Privacy (no raw DIDs)       | Good                | Strong                 | - |

## Adding New Tests

When adding new protocol features:

1. Add unit/integration tests in the relevant package.
2. **Always** add corresponding tests to `packages/conformance/src/server/`.
3. Update this document and the conformance `README.md`.

## Future Improvements

- Migrate more tests to use the standalone conformance runner.
- Investigate alternative Workers testing solutions (e.g., `wrangler test` improvements or custom harness).

---

**Last Updated:** 2026-06-23 (v0.9.1 release)