# Client SDK Design for Sovereign Mobility – Phase 1 (v0.7.0)

**Status:** Draft  
**Target Release:** v0.7.0  
**Related Design:** [v0.7.0 Sovereign Mobility – Phase 1 (Minimal Migration)](v070-sovereign-mobility-phase1.md)

---

## 1. Overview

This document describes the proposed changes to the official TypeScript SDKs (`@didbox/sdk-core` and `@didbox/sdk-crypto`) to support **Sovereign Mobility Phase 1**.

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

- Full high-level `migrate()` orchestration with download + re-upload (deferred or kept very basic).
- Built-in progress reporting specific to migration.
- Cancellation support for migration flows.
- Automatic presentation of the Migration Authorization to the destination node (this is a Phase 2+ concern).

---

## 4. Current SDK State (v0.6.2)

- **`@didbox/sdk-core`**: Provides `DidBoxClient` with high-level methods (`store`, `retrieve`, `extend`, `getLeases`, etc.) and optional automatic 402 handling.
- **`@didbox/sdk-crypto`**: Low-level cryptographic helpers (`createKeypair`, `signRequest`, `extractPublicKeyFromDid`, `verifySignature`).
- The signing interface was recently updated to the four-parameter form (`signRequest(timestamp, method, path, body)`) to match the protocol binding rules.

The SDKs currently have no concept of Migration Authorizations or node-level identities.

---

## 5. Proposed SDK Changes

### 5.1 `@didbox/sdk-crypto` Additions

The `MigrationAuthorization` interface (the protocol-level object) will be defined in `@didbox/sdk-core` (as that is where most developers will interact with it). It will be re-exported from `@didbox/sdk-crypto` for use with the verification helper.

Add a verification helper for Migration Authorizations:

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

This function will:
- Remove the `signature` field
- Canonicalize the object using JCS (RFC 8785)
- Verify the Ed25519 signature

### 5.2 `@didbox/sdk-core` Additions

#### Low-level Method (Recommended for Phase 1)

```ts
class DidBoxClient {
  /**
   * Requests a Migration Proof (signed MigrationAuthorization object) from the source node.
   * The signature is automatically verified by default.
   *
   * The method is named `getMigrationProof` rather than `getMigrationAuthorization`
   * to avoid implying that the client is "asking permission" from the source node.
   * The data belongs to the client; this call simply obtains a verifiable proof of
   * historical ownership and remaining lease time.
   */
  async getMigrationProof(
    storageId: string,
    options?: {
      verifySignature?: boolean; // default: true
    }
  ): Promise<MigrationAuthorization>;
}
```

**Behavior:**
- Calls `POST /migrate/{storageId}/authorize` on the source node.
- If `verifySignature` is `true` (default), it fetches the source node’s `node_identity` from its `/.well-known/didbox-configuration` and verifies the signature using the crypto helper.
- Returns a result object containing the `MigrationAuthorization` and a `verified` flag:

```ts
interface GetMigrationProofResult {
  authorization: MigrationAuthorization;
  verified: boolean;
  verificationError?: string; // present only if verified === false
}
```

- This approach returns meaningful information even on verification failure (rather than throwing), which aligns with the philosophy of only treating true dead-end conditions as hard failures.

#### Method Naming Rationale

The method is named `getMigrationProof()` instead of `getMigrationAuthorization()` for an important reason:

From the client’s perspective, the data belongs to them. Framing the call as “getting an authorization” can unintentionally imply that the client is asking the source node for *permission* to move their own data. 

Instead, `getMigrationProof()` better communicates that the client is obtaining a **verifiable cryptographic proof** of historical ownership and remaining lease time. This proof can later be used when negotiating with a destination node (e.g., to match remaining lease duration or obtain better migration pricing).

#### Client Mental Model

From the client’s perspective, the data stored in didbox402 belongs to them. The Migration Proof is not the source node granting “permission” to move the data — it is simply a signed statement attesting to what the client already owns and how much lease time remains. This distinction is important for the mental model we want to promote in the SDK.

#### Optional High-level Helper (Basic)

We may provide a lightweight convenience method in Phase 1:

```ts
async migrate(
  sourceStorageId: string,
  options: {
    destinationUrl: string;
    newDurationHours: number;
    // inboxAlias, etc. in the future
  }
): Promise<{ newStorageId: string }>;
```

**Scope for Phase 1:** This helper would orchestrate `getMigrationProof()` + `retrieve()` + `store()`. It would **not** present the Migration Proof to the destination node (that is planned for a later phase).

---

## 6. Verification Behavior

- **Default behavior**: `getMigrationProof()` automatically verifies the signature of the returned `MigrationAuthorization` using the source node’s public key (fetched from its discovery document).
- The method returns a result object with a `verified` boolean flag rather than throwing on failure. This design choice reflects the preference to return meaningful information on non-dead-end conditions (e.g., verification failure due to key rotation, clock skew, or temporary issues) instead of treating them as hard failures.
- Users can disable automatic verification by passing `{ verifySignature: false }`.
- A separate low-level helper `verifyMigrationAuthorization()` will also be available in `@didbox/sdk-crypto` for advanced use cases.

---

## 7. Progress Reporting (General Approach)

Progress hooks are considered valuable but should **not** be implemented as migration-specific features in Phase 1.

**Recommended direction:**
- Design a general progress reporting mechanism that can be used by `store()`, `retrieve()`, and future `migrate()` operations.
- This avoids creating a special migration-only progress API that would need to be generalized later.

Progress hooks are therefore noted as a **future SDK improvement** rather than a Phase 1 deliverable.

---

## 8. Error Handling

New or extended error types are recommended:

- `DidBoxMigrationError` (base)
- `DidBoxVerificationError` (when signature verification fails)
- Reuse existing `DidBoxError` and `DidBoxPaymentRequiredError` where appropriate.

The SDK should distinguish between:
- Network / HTTP errors
- Ownership / authorization errors (403, 410)
- Cryptographic verification failures

---

## 9. Future Extensibility

The design should support the following without major breaking changes:

- Presenting the `MigrationAuthorization` to the destination node (enhanced migration).
- Streaming / progress-aware migration.
- Multi-step migration workflows (e.g., dry-run, actual move, cleanup).
- Different migration strategies (client-only vs. assisted).

By keeping the low-level `getMigrationAuthorization()` method clean and separate, higher-level flows can be built on top later.

---

## 10. Open Questions

1. Should `getMigrationAuthorization()` throw on verification failure by default, or return a result object containing both the authorization and a verification status?
2. How should the SDK surface the source node’s `node_identity` (if the user wants to verify manually)?
3. Should we export the `MigrationAuthorization` interface from `sdk-core` or keep it in `sdk-crypto`?
4. What is the desired naming for the high-level helper (`migrate`, `moveStorage`, `transferBox`, etc.)?

---

## 11. Implementation Notes

- The `MigrationAuthorization` type should be shared (or re-exported) between `sdk-core` and `sdk-crypto`.
- `sdk-core` will need to be able to fetch discovery documents from arbitrary nodes (not just its configured `baseUrl`).
- We should add the new methods to the existing `DidBoxClient` rather than creating a separate migration client.
- Tests should cover both verified and unverified paths.

---

## 12. Summary

| Layer              | Phase 1 Deliverable                          | Notes |
|--------------------|----------------------------------------------|-------|
| `sdk-crypto`       | `verifyMigrationAuthorization()`             | Low-level, reusable |
| `sdk-core`         | `getMigrationProof(storageId, options)`      | Returns `{ authorization, verified, verificationError? }`. Automatic verification by default. |
| `sdk-core`         | Basic `migrate()` helper (optional)          | Thin orchestration (get proof + retrieve + store) |
| Progress / Cancel  | Not implemented in Phase 1                   | General progress design recommended soon |
| Verification       | Automatic + opt-out                          | Aligns with protocol values |

This approach keeps Phase 1 focused, safe, and aligned with the minimal migration design while leaving clear extension points for future work.

---

*This document is intended to be living. Feedback welcome before implementation begins.*