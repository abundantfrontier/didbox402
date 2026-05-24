# didbox402 Public Roadmap

This roadmap outlines the planned evolution of the **didbox402** protocol and reference implementation.

## Current Milestone: v0.7.0 (Sovereign Mobility + Real Rails)
**Status:** Released
**Focus:** Client-driven migration, Node Identity, real payment provider integration, and conformance expansion.

- [x] Sovereign Mobility Phase 1 (Migration Proofs + Node Identity + JCS signing)
- [x] Real L402 (AlbyProvider) + Real x402 (BaseUSDCProvider + viem)
- [x] Versioned L402 token + `used_payments` replay protection
- [x] Expanded Conformance Suite (`l402.test.ts`, `x402.test.ts`, negative/adversarial cases)
- [x] SDK migration helpers (`getMigrationProof`, `migrate`, `DidBoxClient.forNode`)
- [x] All documentation updated to v0.7.0

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
3.  **Verifiable Credentials (VCs):** Initial support for gated storage based on signed credentials.
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
