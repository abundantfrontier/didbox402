# Changelog

All notable changes to the **didbox402** protocol and reference implementation will be documented in this file.

## [0.1.0] - 2026-05-11

### Added
- **Formal Protocol Specification:** Created `PROTOCOL.md` at root with design goals, non-goals, and concrete API examples.
- **High-Contrast Documentation:** A 10-page browser-friendly HTML suite in `docs/` with unified CSS and "Code Console" styling.
- **TypeScript Client Library:** Added `src/client-lib.ts` to simplify agent integration (store, retrieve, extend, inbox).
- **Automated Conformance Suite:** Implemented `src/__tests__/index.test.ts` using Vitest to verify protocol honesty.
- **Multi-Inbox Support:** Named inboxes with salted hashing for project-scoped privacy and isolation.
- **Dynamic x402 Pricing:** Deterministic pricing for storage (MB-hour) and egress (retrieval bandwidth).
- **The Janitor:** Added automatic garbage collection for expired storage boxes.
- **Quick Start:** Added a comprehensive root `README.md` and security-focused `.gitignore`.

### Changed
- Refactored internal storage helpers to use consistent snake_case for D1 compatibility.
- Updated pricing logic to enforce a 1MB minimum charge.
- Unified visual identity across all documentation pages.

### Fixed
- Resolved CSS bleed-through issues in dark console blocks.
- Fixed 404 links in the documentation index.
- Corrected authorization logic for scoped inbox retrieval.

---
**Version:** 0.1.0  
**Status:** Initial Milestone (Working Draft)
