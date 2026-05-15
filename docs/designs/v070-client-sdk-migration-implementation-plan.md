# Implementation Plan: Client SDK for Sovereign Mobility – Phase 1 (v0.7.0)

**Status:** Draft  
**Related Documents:**
- [v0.7.0 Sovereign Mobility – Phase 1 Design](v070-sovereign-mobility-phase1.md)
- [Client SDK Design for Sovereign Mobility – Phase 1](v070-client-sdk-migration.md)

**Date:** 2026-05-14

---

## 1. Overview

This document provides a detailed implementation plan for delivering the **Client SDK** components required to support **Sovereign Mobility Phase 1** in didbox402 v0.7.0.

The focus is on enabling developers to:
- Request a `Migration Proof` (`getMigrationProof()`) from a source node
- Automatically verify the cryptographic proof
- Optionally use a basic high-level `migrate()` helper

This plan follows the decisions made in the Client SDK Design document, including:
- Low-level first approach (`getMigrationProof()` before a full `migrate()` helper)
- Automatic verification by default, returning a result object with a `verified` flag
- `MigrationAuthorization` type primarily defined in `@didbox/sdk-core`
- Use of `DidBoxClient.forNode()` pattern for talking to arbitrary nodes
- Deferral of general progress hooks and cancellation

---

## 2. Guiding Principles

- **Safety by default**: Automatic verification should be on by default.
- **Developer Experience**: Prefer returning useful information over throwing on non-fatal conditions.
- **Future-Proofing**: Design APIs and internal structure so enhanced migration (Phase 2+) can be added cleanly.
- **Minimal Surface in Phase 1**: Keep the high-level `migrate()` helper intentionally basic.
- **Clear Layering**: Cryptographic concerns stay in `sdk-crypto`; client experience lives in `sdk-core`.

---

## 3. Package Responsibilities

| Package              | Primary Owner                          | Key Deliverables |
|----------------------|----------------------------------------|------------------|
| `@didbox/sdk-crypto` | Cryptography & Verification            | `verifyMigrationAuthorization()`, `MigrationAuthorization` interface |
| `@didbox/sdk-core`   | High-level client experience           | `getMigrationProof()`, `migrate()`, `DidBoxClient.forNode()`, public API, error types |

**Type Strategy**:
- `MigrationAuthorization` interface is defined in `@didbox/sdk-core`.
- It is re-exported from `@didbox/sdk-crypto` for use with the verification helper.

---

## 4. Proposed File & Module Structure

### `@didbox/sdk-crypto`

```
src/
├── index.ts
├── migration.ts                  # New
│   └── verifyMigrationAuthorization.ts
└── types.ts                      # Add MigrationAuthorization interface
```

### `@didbox/sdk-core`

```
src/
├── index.ts
├── client/
│   ├── DidBoxClient.ts           # Add getMigrationProof() + migrate()
│   └── node-client.ts            # New – lightweight client for arbitrary nodes
├── migration/
│   ├── getMigrationProof.ts      # New
│   └── migrate.ts                # New (basic helper)
├── types/
│   └── migration.ts              # Re-exports + result types
└── errors/
    ├── DidBoxVerificationError.ts
    └── DidBoxMigrationError.ts
```

---

## 5. Detailed Phased Implementation Plan

### Phase A: Crypto Layer (`@didbox/sdk-crypto`)

**Goal**: Deliver a reliable verification primitive.

**Tasks**:
1. Define and export `MigrationAuthorization` interface in `types.ts`.
2. Implement `verifyMigrationAuthorization(auth, nodePublicKey)` using JCS canonicalization.
3. Add unit tests for verification (valid, invalid, tampered fields, missing fields).
4. Handle edge cases (e.g., `signature` field present in the object).
5. Export cleanly from `index.ts`.

**Deliverable**: Working `verifyMigrationAuthorization()` function with tests.

---

### Phase B: Core Client Methods (`@didbox/sdk-core`)

**Goal**: Deliver `getMigrationProof()` with automatic verification.

**Tasks**:
1. Create `node-client.ts` – a lightweight internal client capable of making authenticated requests to arbitrary nodes.
2. Implement `getMigrationProof(storageId, options?)`:
   - Call `/migrate/{storageId}/authorize` on the source node.
   - Optionally fetch `node_identity` from the source node’s discovery document.
   - Call `verifyMigrationAuthorization()` from `sdk-crypto`.
   - Return `{ authorization, verified, verificationError? }`.
3. Support `{ verifySignature: false }` to skip verification.
4. Define error types (`DidBoxVerificationError`, `DidBoxMigrationError`).
5. Add comprehensive JSDoc and TypeScript types.

**Deliverable**: Functional `getMigrationProof()` method.

---

### Phase C: High-level `migrate()` Helper

**Goal**: Provide a convenient (but intentionally basic) migration helper.

**Tasks**:
1. Implement `migrate(sourceStorageId, options)` that:
   - Calls `getMigrationProof()` on the source.
   - Calls `retrieve()` on the source.
   - Calls `store()` on the destination.
   - Returns the new `storageId` from the destination.
2. Design a clean `MigrateOptions` interface.
3. Implement good error handling and propagation across steps.
4. Document limitations clearly (no proof presentation to destination in Phase 1).

**Deliverable**: Usable basic `migrate()` helper.

---

### Phase D: Polish, Testing & Exports

**Tasks**:
- Write integration and unit tests for all new methods.
- Ensure proper public exports from both packages.
- Add error type exports and documentation.
- Review public API surface for consistency and ergonomics.

---

### Phase E: Documentation & Examples

**Tasks**:
- Add migration examples to the Implementer Guide.
- Document `getMigrationProof()`, `verifyMigrationAuthorization()`, and `migrate()`.
- Add a “Migrating Data Between Nodes” section.
- Update READMEs if necessary.

---

## 6. API Surface (Proposed for Phase 1)

### `@didbox/sdk-crypto`

```ts
export interface MigrationAuthorization { ... }

export async function verifyMigrationAuthorization(
  auth: MigrationAuthorization,
  nodePublicKey: Uint8Array
): Promise<boolean>;
```

### `@didbox/sdk-core`

```ts
export interface GetMigrationProofResult {
  authorization: MigrationAuthorization;
  verified: boolean;
  verificationError?: string;
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
}

// Factory for talking to arbitrary nodes
static forNode(
  nodeUrl: string,
  config: { signRequest: ... }
): DidBoxClient;
```

---

## 7. Key Technical Decisions Made

| Decision | Chosen Approach | Rationale |
|----------|------------------|---------|
| Talking to arbitrary nodes | Lightweight internal `node-client.ts` + `DidBoxClient.forNode()` | Cleaner than mutating a single client instance; future-proof |
| Verification on failure | Return `{ verified: false, verificationError }` | Matches user preference for returning useful information |
| Type location | Defined in `sdk-core`, re-exported from `sdk-crypto` | Best developer experience |
| `migrate()` scope in Phase 1 | Thin orchestration only | Keeps surface small and expectations realistic |
| Progress / Cancellation | Not included in Phase 1 | Will be designed as a general SDK feature later |

---

## 8. Testing Strategy

- **Unit tests** in `sdk-crypto`: Focus on `verifyMigrationAuthorization()` with various malformed inputs.
- **Integration-style tests** in `sdk-core`: Mock node responses for discovery and the authorize endpoint.
- Test both verified and unverified paths.
- Test error propagation in the `migrate()` helper.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Node identity not yet widely deployed on nodes | Document that full migration features require nodes running v0.7.0+ |
| Verification complexity with JCS | Rely on `canonicalize` package + thorough tests |
| Confusion around basic `migrate()` helper | Clear documentation of limitations in Phase 1 |

---

## 10. Suggested Order of Work

1. **Phase A** – `sdk-crypto` (`verifyMigrationAuthorization()` + type)
2. **Phase B** – Core `getMigrationProof()` + `DidBoxClient.forNode()`
3. **Phase C** – Basic `migrate()` helper
4. **Phase D** – Testing, error types, exports
5. **Phase E** – Documentation and examples

This order allows early validation of the cryptographic layer before building higher-level logic on top of it.

---

## 11. Open Questions (to be resolved during implementation)

1. Exact shape of `MigrateOptions` and return type for the `migrate()` helper.
2. Whether to include a convenience method that throws on verification failure.
3. How aggressively to validate the source node’s `node_identity` in discovery (e.g., warn on mismatch between `source_node` and the URL used).

---

**Next Step**: Once this plan is approved, we can begin with **Phase A** (`sdk-crypto` verification helper).

Would you like me to start drafting the actual code structure and signatures for Phase A, or do you want to review/adjust anything in this plan first?