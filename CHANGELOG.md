# Changelog

All notable changes to the **didbox402** protocol and reference implementation will be documented in this file.

## [0.2.0] - 2026-05-11

### Added
- **Modular Monorepo:** Transitioned to an `npm workspaces` structure with discrete packages:
  - `@didbox/server`: The Cloudflare edge node.
  - `@didbox/sdk-core`: The base HTTP protocol client.
  - `@didbox/sdk-crypto`: Real Ed25519 `did:key` signature and key management utilities.
  - `@didbox/sdk-payments`: Automated x402 payment negotiation and Lightning simulation.
- **Cryptographic Hardening:** Replaced mock signatures with real **Ed25519 EdDSA** verification.
- **Strict Signature Binding:** Enforced `Hash(Method + Path + Body_Hash)` on all requests for tamper and replay protection.
- **x402 Handshake:** Implemented the full `402 Payment Required` challenge-response loop (X-Invoice/X-Payment).
- **Automated SDK Negotiation:** The `DidBoxClient` now handles 402 challenges autonomously when `autoPay` is enabled.
- **Local Dev Mode:** Added a configurable bypass for payment verification to ensure fast local development.

### Changed
- Refactored server routes to support pre-consumed body streams from authentication middleware.
- Simplified `did:key` parsing to focus on Ed25519 (z6Mk) for the v0.2.0 release.

### Fixed
- Fixed critical snake_case vs camelCase mismatch in D1 storage record authorization.
- Corrected SHA-512 integration for `@noble/ed25519` v3 compatibility.

## [0.1.0] - 2026-05-11

### Added
- Initial protocol specification and Hono-based prototype.
- High-contrast documentation and multi-inbox support.

---
**Version:** 0.2.0  
**Status:** Alpha Milestone (Secure Prototype)
