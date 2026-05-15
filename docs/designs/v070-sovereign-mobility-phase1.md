# Design: Sovereign Mobility – Phase 1 (Minimal Migration)

**Status:** Reviewed & Revised (Post-Panel Review)  
**Target Release:** v0.7.0  
**Date:** 2026-05-14  
**Author:** Grok (based on team discussion + panel review)

---

## Panel Review Summary (May 2026)

A four-person expert panel (Protocol Architect, Security & Cryptography, Privacy, and Implementer/SDK) reviewed this design. 

**Overall Verdict:** Approve direction with targeted clarifications.

**Major Strengths Identified:**
- Correct "minimal first" philosophy
- Strong alignment with cryptographic sovereignty
- Good extensibility planning
- Client-in-the-middle model is the right choice

**Key Issues Raised by the Panel (now addressed in this revision):**

1. **Node Identity Gap** (High severity, all reviewers) — Nodes currently have no identity keys. This revision adds a clear path for node signing keys via discovery.
2. **Replay / Abuse of Migration Authorization** (High/Medium) — Added issuance nonce and single-use recommendation.
3. **Privacy Tension** (High) — Made `source_node` and `original_storage_id` optional with privacy guidance.
4. **"Minimal" Understates Effort** (Medium) — Added clearer implementation impact section.
5. **Canonicalization Ambiguity** (Medium) — Adopted JSON Canonicalization Scheme (JCS, RFC 8785) + test vectors requirement.

This revised version incorporates the panel feedback while preserving the minimal Phase 1 scope.

---

## 1. Overview

This document describes **Phase 1** of Sovereign Mobility for didbox402: the ability for a client to verifiably migrate a storage box from one node to another while preserving cryptographic sovereignty.

### Goals for Phase 1

- Allow a client to obtain cryptographic proof from Node A that they own a box and have remaining lease time.
- Keep data movement client-side (client pulls from A, pushes to B).
- Minimize changes required on destination nodes (Node B).
- Design the core artifact (Migration Authorization) in a way that supports future enhancements without breaking changes.

### Non-Goals for Phase 1

- Server-to-server data transfer.
- Mandatory awareness by Node B that a migration is occurring.
- Automatic lease transfer or refunds.
- Multi-hop or federated migration.

---

## 2. Problem Statement

Clients need to move data between independent didbox402 nodes (different providers, regions, pricing, etc.).

Key constraints:
- The client must retain full control of their private keys at all times.
- Different nodes have different payment recipients, so leases cannot be directly transferred.
- Egress fees on the source node must be paid by the client.
- There should be a verifiable record that a migration occurred properly.

---

## 3. Design Principles

1. **Client in the Middle** — The client orchestrates the migration.
2. **Minimal Trust** — Node B only needs to trust the client in Phase 1.
3. **Verifiability** — The client should be able to prove to third parties that they performed a legitimate migration.
4. **Extensibility** — The design must allow Node B to optionally accept migration proofs in the future for better UX (matching remaining lease time, migration pricing, etc.).
5. **Privacy** — A client should be able to migrate without Node B learning that the data came from another didbox402 node (unless the client chooses to disclose it).

---

## 4. Proposed Solution: Migration Authorization

The core new concept is the **Migration Authorization** — a signed statement issued by the source node (Node A) that proves:

- The client owns a specific `storageId`
- How much lease time remained at the time of the request
- The exact ciphertext that existed (via hash)

This object is **generic** — it is not tied to a specific destination node.

### 4.1 Migration Authorization Format (v1)

```json
{
  "version": 1,
  "original_storage_id": "uuid",
  "owner_did": "did:key:z6Mk...",
  "size_bytes": 104857600,
  "ciphertext_hash": "sha256:0x...",
  "remaining_lease_hours": 142,
  "issued_at": "2026-05-14T12:00:00Z",
  "expires_at": "2026-06-14T12:00:00Z",
  "source_node": "https://node-a.example.com",   // OPTIONAL
  "issuance_nonce": "random-uuid",               // RECOMMENDED for replay protection
  "signature": "hex-encoded Ed25519 signature over JCS canonical JSON"
}
```

**Signature Rules (Normative):**
- Use **JSON Canonicalization Scheme (JCS)** as defined in RFC 8785.
- The signature covers the entire object **excluding** the `signature` field.
- Nodes **MUST** publish their signing public key (see Section 4.3).

**Validity Rules:**
- The authorization **expires when the original lease on Node A expires** (plus a small grace period of up to 48 hours).
- Node A **MUST** refuse to issue a Migration Authorization for an expired lease.

### 4.2 Optional Fields for Privacy

The following fields **SHOULD** be treated as optional by verifiers and **MAY** be omitted by privacy-sensitive clients:

- `source_node`
- `original_storage_id`
- `issuance_nonce` (if not needed for the client’s use case)

Clients that want maximum stealth can request a minimal authorization containing only:
- `version`
- `owner_did`
- `ciphertext_hash`
- `remaining_lease_hours`
- `issued_at` / `expires_at`
- `signature`

### 4.3 Node Identity & Signing Keys (Added Post-Panel)

For the Migration Authorization to be third-party verifiable, nodes must have an identity.

**Phase 1 Requirements:**

- Every node **SHOULD** publish a `node_did` (did:key) and its corresponding Ed25519 public key in the `/.well-known/didbox-configuration` response.
- Recommended addition to Discovery:

```json
{
  "protocol_version": "0.6.2",
  ...
  "node_identity": {
    "did": "did:key:z6Mk...",
    "public_key": "base58btc or hex of the Ed25519 public key"
  }
}
```

This is the **minimum** required to make the design workable. Full node DID support can be expanded in later releases.

---

## 5. Protocol Flow (Phase 1)

### Step 1: Client requests Migration Authorization from Node A

```
POST /migrate/{storageId}/authorize
Authorization: DID signature headers (normal)
```

**Response (200):**
```json
{ Migration Authorization object }
```

### Step 2: Client prepares new lease with Node B

The client performs a normal `POST /store` on Node B.  
**Node B has no knowledge** that this is part of a migration.

### Step 3: Client moves the data

1. Client downloads the ciphertext from Node A (pays any egress).
2. Client uploads the ciphertext to Node B (pays new storage).

### Step 4: (Future) Optional Presentation to Node B

In future versions, the client *may* present the Migration Authorization to Node B for better terms. This is explicitly out of scope for Phase 1.

---

## 6. New Endpoint

### `POST /migrate/{storageId}/authorize`

**Authentication:** Required (standard DID authentication). Only the owner of the box may call this.

**Behavior:**
- Node A verifies ownership via `owner_hash`.
- Node A computes (or retrieves) the `ciphertext_hash`.
- Node A issues a signed Migration Authorization.

**Rate Limiting & Abuse Protection:**
- Nodes **SHOULD** apply strict rate limiting.
- Nodes **MAY** require a small payment (via normal 402 flow) for this endpoint in production.

**Error Codes:**
- `403 Forbidden` — Not the owner
- `410 Gone` — Lease has expired

---

## 7. Security Considerations

- The Migration Authorization proves **past ownership at a point in time**, not current access rights.
- Including `ciphertext_hash` prevents the client from later claiming different data was migrated.
- **Replay Protection:** Clients and verifiers **SHOULD** treat the authorization as single-use where possible (via `issuance_nonce`).
- New attack surface: Compromise of a node’s signing key allows offline forgery of Migration Authorizations. Nodes must protect these keys at least as well as any administrative keys.

---

## 8. Privacy Considerations

The Migration Authorization is an **explicit exception** to the protocol’s “no raw DIDs” rule (see PROTOCOL.md §6.2).

- Disclosure of the full object (especially `owner_did` + `source_node`) creates a portable, attributable migration record.
- Clients who want to minimize leakage should request the **minimal privacy-preserving variant** (see Section 4.2).
- The new `/migrate/.../authorize` endpoint itself reveals migration *intent* to the source node.

---

## 9. Future Extensibility

This design is intentionally minimal so that enhanced flows can be added cleanly later:

- Optional `migration` field in `POST /store`
- Dedicated `POST /migrate/accept` endpoint on Node B
- Cryptographic verification of the Migration Authorization by the destination node
- Migration-specific pricing and remaining-lease matching

The versioned `MigrationAuthorization` object + optional fields give us a clean evolution path.

---

## 10. Implementation Impact (Revised)

While destination nodes require zero changes in Phase 1, **source-capable nodes** must implement:

- New authenticated endpoint
- Ed25519 signing capability (new for nodes)
- Publication of node signing key via discovery
- JSON Canonicalization Scheme (JCS) support
- Optional storage of `ciphertext_hash` for performance

This is more work than a pure client-side feature, but still significantly lighter than a server-to-server migration model.

---

## 11. Open Questions / Decisions

| Question | Current Decision |
|---------|------------------|
| Validity tied to remaining lease? | Yes |
| Generic vs destination-specific? | Generic |
| Include ciphertext hash? | Yes |
| Node B required to understand migrations in Phase 1? | No |
| `source_node` / `original_storage_id` optional? | Yes (for privacy) |
| Node signing key publication required? | Yes (via discovery) |

---

## 12. Next Steps

1. Finalize node identity format in discovery (`node_did` + public key) — **highest priority per panel**.
2. Add Migration Authorization definition and new endpoint to `PROTOCOL.md` (in progress).
3. Update OpenAPI specification with the new endpoint and schema.
4. Implement `/migrate/.../authorize` endpoint in the reference server.
5. Add conformance tests for migration authorization issuance and verification.
6. Create high-level `migrate()` helper in `sdk-core` + crypto helpers in `sdk-crypto`.
7. Document node signing key best practices and protection requirements.

---

*This is the revised post-panel version of the design.*