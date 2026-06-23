# Client SDK Design for Sovereign Mobility – Phase 1 (v0.7.0)

**Status:** **Superseded / Withdrawn** (v0.8.0 removed server migration proofs)  
**Target Release:** v0.7.0 (shipped, then removed)
**Related Design:** [v0.7.0 Sovereign Mobility – Phase 1 (Minimal Migration)](v070-sovereign-mobility-phase1.md)  
**Implementation Plan:** [Client SDK Implementation Plan](v070-client-sdk-migration-implementation-plan.md)

**Last Updated:** 2026-05-15 (Post-implementation)

---

## Post-Implementation Summary

This design document has been successfully implemented in v0.7.0.

### What Was Delivered

- `getMigrationProof(storageId, options?)` with automatic signature verification
- `migrate(sourceId, options)` basic helper
- `DidBoxClient.forNode(url, config)` factory method
- `MigrationAuthorization` interface + `verifyMigrationAuthorization()` in `@didbox/sdk-crypto`
- `DidBoxMigrationError` with `stage` field for better diagnostics
- Node Identity helper functions (`publicKeyToDidKey`, `publicKeyToMultibase`)
- Full test coverage + conformance tests

### Key Decisions Made During Implementation

- `MigrationAuthorization` type was placed in `@didbox/sdk-crypto` (not `@didbox/sdk-core` as originally proposed in some sections)
- The high-level method is named `getMigrationProof()` (this was strongly preferred and implemented)
- Automatic verification returns a result object (`{ verified, verificationError? }`) rather than throwing
- Progress reporting was deferred (as recommended in this design)
- The implementation used a simpler file structure than some proposals

See the [Implementation Plan](v070-client-sdk-migration-implementation-plan.md) for detailed deviations and final code locations.

---

## 1. Overview

This document describes the design for the official TypeScript SDKs (`@didbox/sdk-core` and `@didbox/sdk-crypto`) to support **Sovereign Mobility Phase 1**.

The goal is to give developers a safe, ergonomic way to interact with the new `POST /migrate/{storageId}/authorize` endpoint and to prepare for future enhanced migration flows, while staying consistent with the existing SDK design and the core principles of didbox402 (cryptographic sovereignty, client-driven key management, and verifiability).

---

## 2. Goals for Phase 1

- Provide a clean, low-level way to request a **Migration Proof** (`getMigrationProof()`) from a source node.
- Automatically verify the signature of the returned `MigrationAuthorization` object by default.
- Keep the API surface minimal and consistent with the existing `DidBoxClient` patterns.
- Design with future extensibility in mind (enhanced migration, progress reporting, etc.).
- Avoid over-engineering features that are better solved at a general level (e.g., progress hooks for all large transfers).

---

## 3. Non-Goals for Phase 1

- Full high-level `migrate()` orchestration with download + re-upload (kept intentionally basic in Phase 1).
- Built-in progress reporting specific to migration.
- Cancellation support for migration flows.
- Automatic presentation of the Migration Authorization to the destination node (this is a Phase 2+ concern).

---

## 4. SDK State Before v0.7.0 (Historical)

- **`@didbox/sdk-core`**: Provided `DidBoxClient` with high-level methods (`store`, `retrieve`, `extend`, `getLeases`, etc.) and optional automatic 402 handling.
- **`@didbox/sdk-crypto`**: Low-level cryptographic helpers (`createKeypair`, `signRequest`, `extractPublicKeyFromDid`, `verifySignature`).
- The signing interface was updated to the four-parameter form (`signRequest(timestamp, method, path, body)`) to match the protocol binding rules.

The SDKs had no concept of Migration Authorizations or node-level identities prior to v0.7.0.

---

## 5. Proposed SDK Changes (Design Phase)

### 5.1 `@didbox/sdk-crypto` Additions

A verification helper for Migration Authorizations:

```ts
export interface MigrationAuthorization {
  version: number;
  original_storage_id: string;
  owner_did: string;
  size_bytes: number;
  ciphertext_hash: string;
  remaining_lease_hours: number;
  issued_at: string;
  expires_at: string;
  source_node?: string;
  issuance_nonce?: string;
  signature: string;
}

/**
 * Verifies a Migration Authorization using the source node's public key.
 */
export async function verifyMigrationAuthorization(
  auth: MigrationAuthorization,
  nodePublicKey: Uint8Array
): Promise<boolean>;
```

This function:
- Removes the `signature` field
- Canonicalizes the object using JCS (RFC 8785)
- Verifies the Ed25519 signature

### 5.2 `@didbox/sdk-core` Additions

#### Low-level Method

```ts
class DidBoxClient {
  async getMigrationProof(
    storageId: string,
    options?: {
      verifySignature?: boolean; // default: true
    }
  ): Promise<GetMigrationProofResult>;
}
```

**Behavior (as designed and implemented):**
- Calls `POST /migrate/{storageId}/authorize` on the source node.
- If `verifySignature` is `true` (default), fetches the source node’s `node_identity` from discovery and verifies the signature.
- Returns `{ authorization, verified, verificationError? }`.

#### Optional High-level Helper

A lightweight convenience method was also designed:

```ts
async migrate(
  sourceStorageId: string,
  options: {
    destinationUrl: string;
    newDurationHours: number;
    inboxAlias?: string;
  }
): Promise<{ newStorageId: string }>;
```

**Scope for Phase 1:** This helper orchestrates `getMigrationProof()` + `retrieve()` + `store()`. It does **not** present the Migration Proof to the destination node.

---

## 6. Verification Behavior (Implemented)

- **Default behavior**: `getMigrationProof()` automatically verifies the signature.
- Returns a result object with a `verified` boolean flag rather than throwing on verification failure.
- Users can disable automatic verification with `{ verifySignature: false }`.
- A separate low-level helper `verifyMigrationAuthorization()` is available in `@didbox/sdk-crypto`.

---

## 7. Progress Reporting (General Approach)

Progress hooks were considered valuable but were **not** implemented as migration-specific features in Phase 1.

**Approach taken:**
- General progress reporting was deferred as a broader SDK improvement.
- This avoids creating a special migration-only progress API that would need to be generalized later.

---

## 8. Error Handling (Final Implementation)

New error type introduced:

- `DidBoxMigrationError` with a `stage` property (`'proof' | 'retrieve' | 'store' | 'unknown'`)

This provides much better diagnostics than the originally proposed separate `DidBoxVerificationError`.

---

## 9. Future Extensibility

The design supports the following without major breaking changes (as intended):

- Presenting the `MigrationAuthorization` to the destination node (Phase 2+)
- Streaming / progress-aware migration
- More advanced migration workflows

---

## 10. Open Questions — Resolutions (v0.7.0)

| # | Original Question | Resolution |
|---|-------------------|----------|
| 1 | Should `getMigrationProof()` throw on verification failure or return a result object? | **Resolved**: Returns result object with `verified` + `verificationError`. This was the preferred approach. |
| 2 | How should the SDK surface the source node’s `node_identity`? | Developers can access it via discovery. The client automatically uses it for verification. Manual access is possible via `forNode()`. |
| 3 | Should we export `MigrationAuthorization` from `sdk-core` or keep it in `sdk-crypto`? | **Resolved**: Defined in `sdk-crypto`, re-exported from `sdk-core` for convenience. |
| 4 | Desired naming for the high-level helper? | **Resolved**: Named `migrate()`. The low-level method is `getMigrationProof()`. |

---

## 11. Implementation Notes (Historical)

- The `MigrationAuthorization` type is shared between `sdk-core` and `sdk-crypto`.
- `sdk-core` can fetch discovery documents from arbitrary nodes via `DidBoxClient.forNode()`.
- New methods were added to the existing `DidBoxClient`.
- Tests cover both verified and unverified paths.
- A conformance test suite was added in `packages/conformance/src/server/migration.test.ts`.

---

**Related Documents**

- [Sovereign Mobility Phase 1 Design](v070-sovereign-mobility-phase1.md)
- [Client SDK Implementation Plan](v070-client-sdk-migration-implementation-plan.md) (detailed execution record)

---

*This design was successfully delivered as part of didbox402 v0.7.0.*