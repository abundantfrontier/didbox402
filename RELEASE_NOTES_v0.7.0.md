# didbox402 v0.7.0 Release Notes

**Release Date:** 2026-05-15  
**Status:** Ready for Release

## Highlights

### Sovereign Mobility Phase 1 (Client-Driven Migration)
- New `POST /migrate/{id}/authorize` endpoint
- Mandatory **Node Identity** (`node_identity` in discovery + dedicated Ed25519 signing key)
- Cryptographically verifiable **Migration Proofs** using JCS (RFC 8785) + Ed25519
- SDK support: `getMigrationProof()`, `migrate()`, `DidBoxClient.forNode()`
- New error type: `DidBoxMigrationError` with `stage`

### Real Payment Rails
- Production-grade **L402** via AlbyProvider (real invoice creation + settlement check)
- Production-grade **x402** via BaseUSDCProvider + viem (on-chain Transfer log verification)
- Clean versioned L402 token format with `singleUse: true`
- Replay protection via new `used_payments` table

### Conformance & Quality
- Significantly expanded conformance suite (`l402.test.ts`, `x402.test.ts`, new `migration.test.ts`)
- Structured error types for both payment rails (`AlbyError`, `USDCVerificationError`)
- Official conformance CLI now reports real vs mock provider mode

## Breaking / Notable Changes
- Nodes **MUST** publish `node_identity` in `/.well-known/didbox-configuration` (v0.7.0+)
- `ciphertext_hash` added to `storage_records` table (for Migration Proofs)
- Internal test suite has known flakiness — use conformance suite for validation

## Documentation
- All docs updated to v0.7.0
- New design documents in `docs/designs/`
- Comprehensive `TESTING.md` added

## Packages
All packages bumped to `0.7.0`:
- `@didbox/server`
- `@didbox/sdk-core`
- `@didbox/sdk-crypto`
- `@didbox/sdk-payments`
- `@didbox/conformance`

## Recommended Validation

```bash
# Run conformance against your node
npx @didbox/conformance --url https://your-node.com --did "did:key:..." --key "..."
```

## Links
- [PROTOCOL.md](PROTOCOL.md)
- [CHANGELOG.md](CHANGELOG.md)
- [TESTING.md](TESTING.md)
- Design docs: `docs/designs/`

---

**Ready to tag:** `git tag v0.7.0 && git push origin v0.7.0`