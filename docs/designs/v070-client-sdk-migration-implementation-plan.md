# Implementation Plan: Client SDK for Sovereign Mobility – Phase 1 (v0.7.0)

**Status:** **Superseded / Withdrawn** (v0.8.0 removed server migration proofs)
**Related Documents:**
- [v0.7.0 Sovereign Mobility – Phase 1 Design](v070-sovereign-mobility-phase1.md)
- [Client SDK Design for Sovereign Mobility – Phase 1](v070-client-sdk-migration.md)

**Date:** 2026-05-14  
**Last Updated:** 2026-05-15 (Post-implementation review)

---

## Post-Implementation Notes (v0.7.0)

This plan has been executed. The following major deviations and improvements were made during implementation:

### Key Deviations from Original Plan

| Area | Planned | Actually Delivered |
|------|---------|---------------------|
| Module Structure | Separate `src/migration/`, `src/client/node-client.ts`, and `types/migration.ts` files | Simpler, flatter structure. Most logic lives directly in `DidBoxClient` (`packages/sdk-core/src/index.ts`) |
| `MigrationAuthorization` location | Defined in `@didbox/sdk-core` | Defined in `@didbox/sdk-crypto/src/migration.ts` and re-exported from both packages |
| Error types | `DidBoxVerificationError` + `DidBoxMigrationError` | `DidBoxMigrationError` with `stage` field (`'proof' \| 'retrieve' \| 'store' \| 'unknown'`) — richer than planned |
| Node Identity helpers | Not in scope | Added `publicKeyToDidKey()` and `publicKeyToMultibase()` in `sdk-crypto` |
| Conformance | Not mentioned | New `migration.test.ts` added to the conformance suite |

### Actual Final File Locations

**`@didbox/sdk-crypto`**
- `src/migration.ts` — `MigrationAuthorization` interface + `verifyMigrationAuthorization()`
- `src/index.ts` — Exports + `publicKeyToDidKey()` / `publicKeyToMultibase()`

**`@didbox/sdk-core`**
- `src/index.ts` — `getMigrationProof()`, `migrate()`, `DidBoxClient.forNode()`, error classes, and type re-exports

**Server**
- `packages/server/src/index.ts` — `POST /migrate/{id}/authorize` endpoint + signing logic

**Tests**
- `packages/sdk-core/src/__tests__/migration.test.ts`
- `packages/sdk-crypto/src/__tests__/migration.test.ts`
- `packages/server/src/__tests__/migration.test.ts`
- `packages/conformance/src/server/migration.test.ts`

---

## 1. Overview

This document provided the detailed implementation plan for delivering the **Client SDK** components required to support **Sovereign Mobility Phase 1** in didbox402 v0.7.0.

The focus was on enabling developers to:
- Request a `Migration Proof` (`getMigrationProof()`) from a source node
- Automatically verify the cryptographic proof
- Optionally use a basic high-level `migrate()` helper

The implementation followed the decisions made in the Client SDK Design document, with minor adjustments for simplicity.

---

## 2. Guiding Principles

- **Safety by default**: Automatic verification is on by default.
- **Developer Experience**: Return useful information (`{ verified, verificationError }`) instead of throwing on non-fatal conditions.
- **Future-Proofing**: APIs were designed so enhanced migration (Phase 2+) can be added cleanly.
- **Minimal Surface in Phase 1**: The high-level `migrate()` helper was kept intentionally basic.
- **Clear Layering**: Cryptographic concerns stay in `sdk-crypto`; client experience lives in `sdk-core`.

---

## 3. Package Responsibilities

| Package              | Primary Owner                          | Key Deliverables |
|----------------------|----------------------------------------|------------------|
| `@didbox/sdk-crypto` | Cryptography & Verification            | `verifyMigrationAuthorization()`, `MigrationAuthorization` interface, Node Identity helpers |
| `@didbox/sdk-core`   | High-level client experience           | `getMigrationProof()`, `migrate()`, `DidBoxClient.forNode()`, error types |

**Type Strategy (Final):**
- `MigrationAuthorization` interface is defined in `@didbox/sdk-crypto`.
- It is re-exported from `@didbox/sdk-core` for convenience.

---

## 4. Final File & Module Structure

The team chose a simpler structure than originally proposed:

### `@didbox/sdk-crypto`
```
src/
├── index.ts
└── migration.ts                  # Contains interface + verification function
```

### `@didbox/sdk-core`
```
src/
├── index.ts                      # Main exports + DidBoxClient methods
├── __tests__/migration.test.ts
└── errors/
    └── DidBox*Error.ts
```

This flatter approach was preferred for faster iteration in Phase 1.

---

## 5. Execution Summary

### Phase A: Crypto Layer (`@didbox/sdk-crypto`) — Completed
- Defined `MigrationAuthorization` interface.
- Implemented `verifyMigrationAuthorization(auth, nodePublicKey)` using JCS + Ed25519.
- Added thorough unit tests (valid, tampered, bad key, malformed).
- Exported `publicKeyToDidKey()` and `publicKeyToMultibase()` helpers (added during implementation).

### Phase B: Core Client Methods (`@didbox/sdk-core`) — Completed
- Implemented `getMigrationProof(storageId, { verifySignature? })`.
- Added `DidBoxClient.forNode()` factory.
- Automatic discovery fetch + verification by default.
- Returns `{ authorization, verified, verificationError? }`.
- Support for `{ verifySignature: false }`.

### Phase C: High-level `migrate()` Helper — Completed
- Basic orchestration: `getMigrationProof()` → retrieve from source → store on destination.
- `DidBoxMigrationError` with `stage` for better error diagnosis.
- Clear documentation of Phase 1 limitations.

### Phase D: Polish, Testing & Exports — Completed
- Unit + integration tests across all three packages.
- Proper public exports and type re-exports.
- Structured error classes.

### Phase E: Documentation & Examples — Completed
- Added migration section to the Implementer’s Guide.
- Updated all `docs/*.html` files for v0.7.0.
- Added conformance tests for migration.

---

## 6. Final API Surface (v0.7.0)

### `@didbox/sdk-crypto`
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

export async function verifyMigrationAuthorization(
  auth: MigrationAuthorization,
  nodePublicKey: Uint8Array
): Promise<boolean>;

export function publicKeyToDidKey(publicKey: Uint8Array): string;
export function publicKeyToMultibase(publicKey: Uint8Array): string;
export function extractPublicKeyFromDid(did: string): Uint8Array;
```

### `@didbox/sdk-core`
```ts
export type { MigrationAuthorization } from '@didbox/sdk-crypto';

export interface GetMigrationProofResult {
  authorization: MigrationAuthorization;
  verified: boolean;
  verificationError?: string;
}

export class DidBoxMigrationError extends DidBoxError {
  stage: 'proof' | 'retrieve' | 'store' | 'unknown';
}

class DidBoxClient {
  async getMigrationProof(
    storageId: string,
    options?: { verifySignature?: boolean }
  ): Promise<GetMigrationProofResult>;

  async migrate(
    sourceStorageId: string,
    options: {
      destinationUrl: string;
      newDurationHours: number;
      inboxAlias?: string;
    }
  ): Promise<{ newStorageId: string }>;

  static forNode(
    nodeUrl: string,
    config: Omit<DidBoxClientConfig, 'baseUrl'>
  ): DidBoxClient;
}
```

---

## 7. Key Technical Decisions (Final)

| Decision | Chosen Approach | Status |
|----------|------------------|--------|
| Talking to arbitrary nodes | `DidBoxClient.forNode()` factory | Implemented |
| Verification on failure | Return `{ verified: false, verificationError }` | Implemented |
| Type location | Defined in `sdk-crypto`, re-exported from `sdk-core` | Implemented |
| `migrate()` scope in Phase 1 | Thin orchestration only | Implemented |
| Error granularity | `DidBoxMigrationError` with `stage` | Enhanced beyond original plan |
| Node Identity public key helpers | `publicKeyToMultibase()` + `publicKeyToDidKey()` | Added during implementation |

---

## 8. Testing Strategy (Executed)

- Unit tests in `sdk-crypto` for cryptographic verification.
- Mocked integration tests in `sdk-core`.
- Real server-side tests in `packages/server`.
- Conformance-level tests in `@didbox/conformance`.

All planned test categories were covered.

---

## 9. Risks & Mitigations (Outcome)

All identified risks were successfully mitigated:
- Node identity requirement was clearly documented.
- JCS verification proved reliable.
- Phase 1 limitations are well communicated in docs.

---

## 10. Open Questions — Resolution

| Question | Resolution |
|----------|------------|
| Exact shape of `MigrateOptions` | Finalized with `destinationUrl`, `newDurationHours`, optional `inboxAlias` |
| Convenience method that throws on verification failure | Not added in Phase 1 (kept minimal) |
| Validation of `source_node` vs URL used | Basic check implemented; stronger validation deferred to Phase 2 |

---

## 11. Lessons Learned

- Keeping the module structure simple paid off for rapid delivery.
- Adding the `stage` field to `DidBoxMigrationError` significantly improved debuggability.
- Publishing real `public_key` values from the server (instead of a placeholder) was necessary for long-term correctness.
- Conformance tests for new protocol features should be planned earlier.

---

**Conclusion**

The implementation plan was successfully executed. While some structural simplifications and enhancements were made during development, the core goals were fully achieved.

**v0.7.0 Sovereign Mobility Phase 1 is complete.**

---

**Related Code Locations (v0.7.0)**

- Client SDK: `packages/sdk-core/src/index.ts`
- Crypto: `packages/sdk-crypto/src/migration.ts`
- Server Endpoint: `packages/server/src/index.ts:482`
- Conformance: `packages/conformance/src/server/migration.test.ts`