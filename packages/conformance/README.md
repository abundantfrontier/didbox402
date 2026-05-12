# @didbox/conformance

The official Protocol Conformance Suite for didbox402.

This package provides a standalone set of tests that external implementers can run against their own servers or clients to verify protocol compatibility.

## Usage (for Node Implementers)

### 1. Install dependencies
```bash
npm install
```

### 2. Configure your endpoint
Create a `conformance.config.ts`:
```typescript
export const config = {
  baseUrl: 'https://your-node.com',
  did: 'did:key:z6Mk...',
  // A function that signs using your test DID's private key
  signRequest: async (data: string) => { ... }
};
```

### 3. Run the tests
```bash
npx vitest run
```

## Mandatory Test Coverage
- **Economic Integrity:** Correct 402 rejection and Satoshi calculation.
- **Cryptographic Isolation:** No cross-alias inbox leakage.
- **Temporal Security:** Enforces ±5m drift window.
- **Replay Resistance:** Rejects used signatures (Nonce Tracking).
- **Privacy Invariant:** Verifies raw DIDs are not discoverable.
