# Changelog

All notable changes to the **didbox402** protocol and reference implementation will be documented in this file.

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
