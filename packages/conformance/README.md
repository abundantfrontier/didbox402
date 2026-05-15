# @didbox/conformance

The official Protocol Conformance Suite for **didbox402** (v0.7.0).

> For information about test environment limitations and recommendations, see the root **[TESTING.md](../../TESTING.md)**.

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
    // Implementation of signature binding (v0.7.0)
    // Hash = SHA256(Timestamp + Method + Path + BodyHash)
  }
};
```

Run the suite:
```bash
npx vitest run node_modules/@didbox/conformance/src/server
```

## Mandatory Test Coverage

The conformance suite validates the following core areas:

- **Economic Integrity**: Correct 402 rejection, proper challenge format for both L402 and x402, and minimum charge enforcement.
- **Cryptographic Isolation**: No cross-alias inbox leakage.
- **Temporal Security**: Enforces ±5m drift window via `X-DID-Timestamp`.
- **Replay Resistance**: Rejects used signatures (DID nonces) and used payment proofs (L402 preimages and x402 tx hashes).
- **Privacy Invariant**: Raw DIDs are never stored in persistent indexes.
- **L402 & x402 Payment Flows** (v0.7.0+): Proper challenge issuance and proof submission for both Lightning and USDC rails.
- **Migration (Sovereign Mobility Phase 1)**: `node_identity` discovery, `/migrate/{id}/authorize` endpoint, and Migration Proof verification.

## Running with Real Payment Providers (L402 & x402)

By default, the conformance suite works against nodes running in `DEV_MODE` (which bypasses real payment verification). For more thorough testing of real payment rails:

### L402 (Lightning via Alby)
- Set `ALBY_API_KEY` on the target node.
- The node will issue real Lightning invoices.
- The conformance suite will test:
  - Proper L402 challenge format
  - Proof submission (preimage + macaroon)
  - Replay protection on used payment hashes

### x402 (USDC on Base)
- Set `USDC_RPC_URL` and `USDC_WALLET_ADDRESS` on the target node.
- The node will perform real on-chain verification of USDC transfers.
- The conformance suite will test:
  - Proper x402 `PAYMENT-REQUIRED` challenge
  - Submission of `PAYMENT-SIGNATURE` (transaction hash)
  - Replay protection on used transaction hashes

Example environment for running conformance against a production-like node:

```bash
export DIDBOX_URL=https://your-node.com
export TEST_DID=did:key:z6Mk...
export TEST_KEY=your_private_key_hex

didbox-conformance --url $DIDBOX_URL --did $TEST_DID --key $TEST_KEY
```

**Note:** When testing against a node with real providers, you must use a DID that the node will accept for storage operations, and the node must have the corresponding payment provider keys configured.

## Troubleshooting

- **401 Unauthorized:** Ensure your `X-DID-Timestamp` is in milliseconds and within the 5-minute window.
- **402 Payment Required:** This is expected for initial requests. The suite verifies that the `WWW-Authenticate` (L402) or `PAYMENT-REQUIRED` (x402) headers are present and correctly formatted.
- **Tests pass in DEV_MODE but fail with real providers:** This is normal. Real payment verification is stricter. Make sure your test DID has actually paid (or the node is configured to accept test transactions).
- **D1_ERROR:** Ensure your node has initialized the required `storage_records`, `inboxes`, and `nonces` tables.
