# GitHub Issue / Discussion Draft

**Title:** [Feedback] Commercial Operator Questions & Clarifications from didboxpro (v0.7.0 Alignment)

---

## Summary

The didboxpro team (building a production-grade commercial didbox402 node) has provided detailed, constructive feedback after reviewing the v0.7.0 specification and documentation.

They are actively aligning their implementation with v0.7.0 and have identified several areas where the spec is clear for reference implementations but requires additional guidance or clarification for **commercial, multi-node, high-availability deployments**.

This issue summarizes their key questions and requests.

---

## Priority Requests (Blockers for v0.7.0 Alignment)

### 1. Partial Rail Advertising (`supported_rails`)

- May a production node advertise only `["x402"]` and still be fully compliant / pass conformance?
- What should the conformance suite behavior be for partial-rail nodes?

**Current Status:** We have clarified in PROTOCOL.md §4.1 that partial support is allowed. Further conformance suite updates may be needed.

### 2. Node Identity Key Management for Fleets

- Recommended approach for managing the Migration Proof signing key across multiple nodes (HA, multi-region)?
- Shared key vs per-node key?

**Current Status:** Added guidance in PROTOCOL.md §7.2 allowing both models.

### 3. SERVICE_SALT Rotation

- Is there (or should there be) a supported way to rotate `SERVICE_SALT` without invalidating all historical inboxes and leases?

**Current Status:** Documented as effectively immutable in PROTOCOL.md §10.2. Future rotation mechanism noted as desirable.

---

## Other Important Clarifications Requested

- **Per-DID / Tiered Pricing** — Allowed if the authenticated `/price` returns the applicable rates.
- **x402 Implementation Guide** — Request for official USDC addresses, recommended RPCs, and verification best practices.
- **Error Code Extensibility** — Desire to use custom operational codes (e.g., `RATE_LIMITED`, `MAINTENANCE_MODE`).
- **Admin Purge Endpoints** — Request to explicitly allow authenticated admin endpoints for production operations.
- **Inbox Alias Creation** — Clarification on implicit vs explicit inbox creation when storing to new aliases.
- **Phase 2 Sovereign Mobility** — Interest in early visibility and design direction.
- **Commercial Certification Path** — Interest in a conformance attestation or verified provider listing.

---

## Proposed Actions

- [x] Update PROTOCOL.md with clarifications (partial rails, pricing, error codes, inbox semantics, node identity fleets, SERVICE_SALT)
- [x] Add Commercial Operator Guidance section to Implementer’s Guide
- [x] Add commercial feedback section to FUTURE.md
- [ ] Enhance conformance suite to better support partial-rail testing
- [ ] Publish official x402 implementation guidance (recommended addresses, patterns, gotchas)
- [ ] Consider lightweight commercial conformance attestation in the future

---

**Link to original feedback document:** (attach or link the full Omnibond feedback)

This is excellent, high-signal feedback from a team building a real commercial product. Their input will help make didbox402 more robust for production use cases.

---

*Opened on behalf of the didboxpro / Omnibond team. They are happy to contribute implementation feedback, test cases, and code once clarifications land.*