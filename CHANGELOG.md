# Changelog

All notable changes to the **didbox402** protocol and reference implementation will be documented in this file.

## [0.5.0] - 2026-05-11

### Added
- **The Mainnet Bridge:** Transitioned from mock payments to real production-patterned rails.
- **Hardened L402 (Lightning):** Implemented real **SHA256 Preimage Verification** and standard-compliant L402 Macaroon headers.
- **Hardened x402 (Web3/USDC):** Integrated **`viem`** for Base chain verification and implemented a pluggable Web3 settlement provider.
- **Agent Wallet SDK:** Updated `DidBoxClient` with native **WebLN** and **EIP-1193** support, allowing agents to autonomously settle invoices via their connected wallets.
- **Unified Handshake:** Simplified the challenge-response flow to be standard-compliant (L402 Macaroons and x402 JSON challenges).

### Changed
- Refactored payment verification into a unified `verifyAnyPayment` module.
- Updated `PROTOCOL.md` to formally document Mainnet settlement rules.

## [0.4.0] - 2026-05-11

### Added
- **Dual-Rail Support:** Added initial architectural support for both Bitcoin/Lightning and Web3/USDC standards.
- **Autonomous SDK Negotiation:** The SDK handles protocol detection and automated retries.

---
**Version:** 0.5.0  
**Status:** Mainnet Bridge (Alpha Draft)
