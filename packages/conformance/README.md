# @didbox/conformance

The official Protocol Conformance Suite for **didbox402**.

This package provides a standalone set of tests and a CLI that external implementers can run against their own servers to verify protocol compatibility.

## Installation

```bash
npm install -g @didbox/conformance
```

## Quick Start

Run the conformance CLI to verify your node's configuration:

```bash
didbox-conformance --url https://your-node.com --did did:key:z6Mk... --key <your-hex-private-key>
```

## Usage in CI/CD

The CLI supports a `--json` mode for automated integration:

```bash
didbox-conformance --url $NODE_URL --did $TEST_DID --key $TEST_KEY --json
```

## Manual Testing Configuration

If you prefer to run tests manually using Vitest, create a `conformance.config.ts`:

```typescript
export const config = {
  baseUrl: 'https://your-node.com',
  did: 'did:key:z6Mk...',
  // A function that signs using your test DID's private key
  signRequest: async (data: string) => { 
    // Implementation of signature binding (v0.6.1)
    // Hash = SHA256(Timestamp + Method + Path + BodyHash)
  }
};
```

Run the suite:
```bash
npx vitest run node_modules/@didbox/conformance/src/server
```

## Mandatory Test Coverage
- **Economic Integrity:** Correct 402 rejection and Satoshi calculation (1MB min charge).
- **Cryptographic Isolation:** No cross-alias inbox leakage.
- **Temporal Security:** Enforces ±5m drift window via `X-DID-Timestamp`.
- **Replay Resistance:** Rejects used signatures (Nonce Tracking).
- **Privacy Invariant:** Verifies raw DIDs are never stored or discoverable.

## Troubleshooting

- **401 Unauthorized:** Ensure your `X-DID-Timestamp` is in milliseconds and within the 5-minute window.
- **402 Payment Required:** This is expected for initial requests. The suite verifies that the `WWW-Authenticate` (L402) or `PAYMENT-REQUIRED` (x402) headers are present.
- **D1_ERROR:** Ensure your node has initialized the required `storage_records`, `inboxes`, and `nonces` tables.
