# Changelog

All notable changes to the **didbox402** protocol and reference implementation will be documented in this file.

## [Unreleased]

### Documentation & Guidance (Post v0.7.0)

- Added new design document: **[Privacy-Preserving Paid Content Distribution](docs/designs/paid-content-distribution-pattern.md)** — Documents the recommended pattern of performing payments off-protocol (directly between buyer and seller) while using didbox402 only for private delivery of encrypted content. Includes legal, uplifting use cases focused on independent journalism & research, professional knowledge products, research datasets, and creative assets. Emphasizes alignment with core privacy and "ghost provider" principles.
- Added significant operational guidance for production node operators in the [Implementer's Guide](docs/implementer-guide.html):
  - Background purge / janitor strategies at scale (Durable Object alarms, Workflows, external schedulers, etc.)
  - Replay protection store lifecycle management, with specific notes on `used_payments` table growth and the need for periodic cleanup
  - Deeper node signing key management recommendations (rotation, fleet considerations, security posture)
- Clarified the boundary between **normative client obligations** and **recommended client SDK capabilities** in [PROTOCOL.md §9](PROTOCOL.md) (split into 9.1 and 9.2) and the Implementer's Guide (new "Client SDK Guidance and Recommendations" section).
- Added [Deletion Semantics, Attestations, and Client-Side Resilience](docs/designs/deletion-semantics-client-resilience.md) design document, including the conversation mirroring pattern for resilience against lease expiry.
- Updated [Threat Model](docs/threat-model.html) with a new "Ephemerality and Deletion" category and cross-references to the new guidance.
- Added references and navigation entries for the new design documents across [README.md](README.md), [docs/index.html](docs/index.html), and the Implementer's Guide.
- Various small improvements to documentation structure and discoverability of client-side and commercial patterns (no protocol changes).

## [0.7.0] - 2026-05-15

### Sovereign Mobility (Phase 1)
- **New `/migrate/{id}/authorize` endpoint**: Returns a signed `MigrationAuthorization` (Migration Proof) containing `owner_did`, `ciphertext_hash`, `remaining_lease_hours`, `source_node`, and Ed25519 signature.
- **Node Identity (mandatory)**: Every node **MUST** publish `node_identity: { did, public_key }` in `/.well-known/didbox-configuration`. The `did:key` (Ed25519) is used to sign Migration Authorizations.
- **JCS canonicalization** (RFC 8785 via `canonicalize` package) for deterministic signing of Migration Proofs.
- **Client-orchestrated migration**: `getMigrationProof()` + `migrate()` helpers in `@didbox/sdk-core`. Client retrieves data and re-stores on destination node. No direct node-to-node coupling in Phase 1.
- New error types: `DidBoxMigrationError` with `stage` (`proof` | `retrieve` | `store`).

### Payments & Conformance Hardening
- **Real L402 via AlbyProvider**: Full Lightning invoice creation + paid status verification through Alby Hub API. Structured `AlbyError` with codes (`AUTH_ERROR`, `RATE_LIMITED`, `NETWORK_ERROR`).
- **Real x402 via BaseUSDCProvider**: `viem` + ERC20 `Transfer` log parsing on Base. 6-decimal USDC handling. Structured `USDCVerificationError`.
- **Clean versioned L402 token** (hybrid approach): JSON token with `version`, `paymentHash`, `amount`, `currency: "sats"`, `singleUse: true`. Single-use enforced server-side via new `used_payments` table.
- **Replay protection**: `used_payments` table + index. `verifyAnyPayment` now rejects reused proofs.
- **Expanded Conformance Suite**: New `l402.test.ts` and `x402.test.ts` covering proof submission, negative cases (bad preimage, wrong amount, malformed, replay), structured error assertions, and smarter real-vs-DEV_MODE detection.
- Conformance CLI now reports "Running with Real Payment Providers" when `ALBY_API_KEY` / `USDC_RPC_URL` are present.

### SDK & Crypto
- `@didbox/sdk-crypto`: New `migration.ts` with `MigrationAuthorization` interface + `verifyMigrationAuthorization()` (JCS + Ed25519).
- `@didbox/sdk-core`: `DidBoxClient.forNode(url, config)` factory, `getMigrationProof(storageId, {verifySignature?})`, `migrate(...)`.
- Signature binding standardized to 4-argument form (`ts + method + path + bodyHash`).

### Documentation & Release
- All `docs/*.html` pages updated to v0.7.0.
- New design docs: `docs/designs/v070-sovereign-mobility-phase1.md`, `v070-client-sdk-migration.md`, and implementation plan.
- Updated `PROTOCOL.md`, `ROADMAP.md`, threat model, privacy, use cases, and verification documentation for Node Identity and Migration Proofs.

### Versioning
- All packages (`@didbox/*`) and root bumped to **0.7.0**.

## [0.6.2] - 2026-05-14

### Protocol Specification (PROTOCOL.md) Changes
- **Section 3.2:** Made signature binding algorithm fully normative with exact byte construction (double SHA-256 + `bodyHashHex`). Added mandatory `Date` header on every response. Clarified grace period and required real Ed25519 (no `mock_sig` in production).
- **Section 4:** Updated x402 JSON schema (`amount` as 6-decimal USDC string). Added **4.4 Payment Replay Protection** (normative, with recommended `used_payments` table). Added **4.5 Pricing Model** (exact `sizeMb = max(1, ceil(...))` formula and rules).
- **Section 5.1:** Added `400` and `404` error codes + normative error body shape `{ "error": "...", "code": "..." }`.
- **Section 5.2/5.4:** Clarified `ciphertext` as base64, added `GET /inboxes` endpoint, documented that inbox provisioning is optional for receiving, added note on administrative janitor endpoint.
- **Section 7.1:** Discovery endpoint declared public (no auth). Schema aligned (`protocol_version`, `max_lease_hours`, `min_charge_mb`, full endpoints including `extend`/`inboxes`). Naming rules documented (snake_case for discovery/price, camelCase elsewhere).
- **Section 9/10:** Expanded Verification Gauntlet to 7 items (added Ephemerality + Discovery/Transport). Added **10.2 Security Requirements** (SERVICE_SALT entropy, raw DID handling, janitor protection). Made conformance reference the actual test locations.
- **New Section 9:** Added "Client Requirements" (signature construction, 402 retry, `X-Inbox-Alias`, clock sync, discovery, ciphertext encoding).

### Reference Implementation Alignment
- Discovery response, error bodies, and `Date` header behavior updated toward spec.
- Pricing model and replay protection requirements now explicit in code comments and schema.

### Documentation
- All `docs/*.html` pages version-bumped to v0.6.2.
- Key examples (discovery, errors, pricing) refreshed.

### Versioning
- All packages (`@didbox/*`) and root bumped to **0.6.2**.

## [0.6.0] - 2026-05-11

### Added
- **Formal Open Protocol Release:** Upgraded the project from a reference prototype to a verifiable open protocol.
- **Implementer's Guide:** Created a comprehensive guide for building compatible didbox402 nodes on any cloud or local infrastructure.
- **Standalone Conformance Suite:** Extracted protocol tests into the `@didbox/conformance` package for third-party implementation testing.
- **Capability Discovery:** Added `GET /.well-known/didbox-configuration` for agents to discover node limits and supported rails autonomously.
- **Structured Error Handling:** Standardized error codes (401, 402, 403, 410, 413) across the protocol.

### Changed
- **Modular SDK:** Refactored `@didbox/sdk-core` to make the 402 "Intelligent Interceptor" explicitly opt-in.
- **Spec Hardening:** Updated `PROTOCOL.md` with RFC 2119 terminology and precise message schemas for x402 and L402.

## [0.5.0] - 2026-05-11

### Added
- **The Mainnet Bridge:** Transitioned from mock payments to real production-patterned rails.
- **Hardened L402 (Lightning):** Implemented real **SHA256 Preimage Verification**.
- **Hardened x402 (Web3/USDC):** Integrated **`viem`** for Base chain verification.

---
**Version:** 0.6.0  
**Status:** Open Protocol Release
