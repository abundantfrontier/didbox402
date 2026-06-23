# didbox402 Public Roadmap

This roadmap outlines the planned evolution of the **didbox402** protocol and reference implementation.

## Current Milestone: v0.9.1 (Panel Review Fixes)
**Status:** Released
**Focus:** Spec consistency, threat model, conformance gauntlet split, SDK hardening.

- [x] Egress/402 vs entitlement contradiction resolved
- [x] §9.1 / §10.1 / §5.1 normative alignment
- [x] Threat model updated for entitlement rail
- [x] OpenAPI receipt enums + 403 responses
- [x] Server startup guard + constant-time compare + `ACCESS_DENIED`
- [x] SDK `clearDiscoveryCache` + `supported_rails` settlement

## Previous Milestone: v0.9.0 (Enterprise Entitlement — Phase 1)
**Status:** Released
**Focus:** Per-node `billing_mode`, API-key entitlement for internal installs, dual-mode client support.

- [x] `billing_mode` (`micropayment` | `entitlement`) in discovery
- [x] `X-DIDBOX-Entitlement` API keys (hashed server-side)
- [x] 403 + `ENTITLEMENT_REQUIRED` on failure; entitlement receipts on success
- [x] SDK discovery branch + `entitlementKey` config
- [x] Enterprise-internal conformance profile (`entitlement.test.ts`)
- [x] Phase 2 extensions documented in FUTURE.md

## Previous Milestone: v0.8.0 (Spec Cleanup + Privacy Simplification)
**Status:** Released
**Focus:** Pricing clarity, client-only cross-node movement, owner delete, optional node identity.

- [x] Remove server-side migration endpoints and Migration Authorization
- [x] `DELETE /store/{id}` (owner purge, no rebate)
- [x] Decoded `storageBytes` + `transferBytes` egress sizing; operator `min_charge_mb`
- [x] `pricing_mode` + public `/price` by default
- [x] Rail-neutral `amountPaid` / `currency` / `rail` response fields
- [x] Conformance suite updated (delete tests; migration tests removed)

## Previous Milestone: v0.7.0 (Sovereign Mobility + Real Rails)
**Status:** Superseded by v0.8.0 migration removal
**Focus:** Real payment rails and conformance expansion (migration proofs since removed).

- [x] Real L402 (AlbyProvider) + Real x402 (BaseUSDCProvider + viem)
- [x] Versioned L402 token + `used_payments` replay protection
- [x] Expanded Conformance Suite (`l402.test.ts`, `x402.test.ts`)

## Previous Milestone: v0.6.x (Security & Interoperability Hardening)
**Goal:** Enable agents to migrate effortlessly between nodes and providers while preserving cryptographic sovereignty.

### Phase 1 (Minimal Migration) – Design Document
A detailed design for the first phase of Sovereign Mobility has been developed:

→ **[v0.7.0 Sovereign Mobility – Phase 1 Design](docs/designs/v070-sovereign-mobility-phase1.md)**  
 **[Client SDK Design & Implementation Plan](docs/designs/v070-client-sdk-migration-implementation-plan.md)**  
 **[Client SDK Migration Design](docs/designs/v070-client-sdk-migration.md)**

This phase introduces a client-orchestrated migration flow using a signed **Migration Authorization** issued by the source node. Key characteristics:
- Client-mediated data movement (pull from source + push to destination)
- Generic, third-party verifiable Migration Authorization
- No changes required on destination nodes in Phase 1
- Strong focus on privacy and future extensibility

### Focus Areas for v0.7.0:
1.  **Sovereign Mobility (Phase 1):** Verifiable migration paths using the Migration Authorization model (see design doc).
2.  **Full Real Payment Rails:** Production-grade L402 (Alby) and x402 (viem) implementations with proper replay protection.
3.  **Verifiable Credentials (VCs):** Moved to long-term extensions (see `docs/extensions.html`).
4.  **Reference Implementations:** Additional platforms (AWS Lambda + S3, standard Node.js + MinIO).

## Long-Term Vision (v1.0.0 and beyond)
**Goal:** A global, decentralized network of didbox402 nodes powering the agentic economy.

For a detailed exploration of strategic questions and potential directions, see **[FUTURE.md](FUTURE.md)**.

### Focus Areas:
- **Registry & Discovery:** Decentralized discovery of didbox402 nodes and their configurations.
- **Advanced Privacy:** Integration of Zero-Knowledge Proofs (ZKPs) for truly anonymous storage retrieval.
- **Global Liquidity:** Unified payment settlement across hundreds of niche and mainstream financial rails.
- **Group Communication:** Client-side patterns and potential future protocol support for secure multi-party / group state while maintaining cryptographic sovereignty (see `docs/designs/group-communication-design.md`).

---
*Note: This roadmap is a living document. Features and priorities may shift based on community feedback and the evolution of the autonomous agent ecosystem.*
