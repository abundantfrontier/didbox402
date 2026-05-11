# Changelog

All notable changes to the **didbox402** protocol and reference implementation will be documented in this file.

## [0.3.0] - 2026-05-11

### Added
- **True DID Parsing:** Implemented real **Multibase (base58btc)** decoding and **Multicodec** verification (`0xed01` for Ed25519) in the middleware and SDK.
- **Advanced Replay Protection:** Introduced mandatory **`X-DID-Timestamp`** and **Nonce Tracking** in D1. Every signature is now single-use and temporally bound to a 5-minute window.
- **Absolute Metadata Privacy:** Refactored the `inboxes` table to use `owner_hash`, ensuring no raw DIDs are ever stored in lookup indexes.
- **Secured Janitor:** Hardened the `/janitor/purge` endpoint with mandatory **`X-Admin-Token`** authentication.
- **Protocol Discovery:** Added `GET /price` for programmatically discovering node rates.
- **Testing Gauntlet:** Expanded to **18 automated tests** across four modular files (`auth`, `storage`, `inboxes`, `economics`), covering exhaustive edge cases for multibase parsing, future timestamps, and replay resistance.

### Changed
- Transitioned to a professional **Modular Monorepo** structure (`npm workspaces`).
- Refactored server routes to support pre-consumed body streams from authentication middleware.

## [0.2.0] - 2026-05-11

### Added
- **Cryptographic Hardening:** Replaced mock signatures with real **Ed25519 EdDSA** verification.
- **Strict Signature Binding:** Enforced `Hash(Method + Path + Body_Hash)` for request integrity.
- **x402 Handshake:** Implemented the full `402 Payment Required` challenge-response loop.
- **Automated SDK Negotiation:** The `DidBoxClient` handles 402 challenges autonomously.

## [0.1.0] - 2026-05-11

### Added
- Initial protocol specification and Hono-based prototype.

---
**Version:** 0.3.0  
**Status:** Hardened Beta (Working Draft)
