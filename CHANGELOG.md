# Changelog

All notable changes to the **didbox402** protocol and reference implementation will be documented in this file.

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
