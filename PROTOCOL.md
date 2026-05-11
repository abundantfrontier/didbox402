# didbox402 Protocol Specification (v0.1.0)

**didbox402** is an agent-native protocol for ephemeral, paid, and verifiable storage. It facilitates trustless data handoff between autonomous entities using Decentralized Identifiers (DIDs) and micropayments.

---

## 1. Core Principles

### 1.1 Ephemerality (Lease Model)
Storage is never permanent. It is a lease defined by `duration_hours`. Once the lease expires, the provider is obligated to purge the data.

### 1.2 Cryptographic Sovereignty
The provider is a "ghost." It holds no decryption keys. All data MUST be encrypted client-side before storage. Identity is proven per-request via DID-based signatures.

### 1.3 Verifiable Economics (x402)
Resource allocation is governed by the 402 Payment Required standard. Nodes act as Lightning Service Providers (LSPs), requiring Satoshis (via Lightning Network) for storage and egress.

---

## 2. Authentication (The Handshake)

Every request to a didbox402 node MUST be authenticated.

### 2.1 Headers
- `X-DID`: The Decentralized Identifier of the caller.
- `X-DID-Signature`: A cryptographic signature of the request hash.

### 2.2 Signature Binding
To prevent replay and tampering, the signature MUST cover the request hash:
`Hash(Method + Path + Body_Hash)`

---

## 3. Storage Mechanics

### 3.1 Inbox Isolation (Multi-Inbox)
A node supports multiple virtual inboxes per DID. Inboxes are identified by a salted hash:
`Inbox_ID = SHA256(Recipient_DID + Alias + Service_Salt)`

Knowing one inbox alias reveals no information about other inboxes belonging to the same DID.

### 3.2 Dynamic Pricing
Storage cost is calculated as:
`Total_Cost = Math.max(1MB, Size) * Duration_Hours * Base_Rate`

---

## 4. API Specification

### 4.1 `POST /store`
Creates a new storage box.
- **Body**: `{ ciphertext, durationHours, recipientDid?, inboxAlias? }`
- **Auth**: Required.
- **Payment**: Required (x402).

### 4.2 `GET /retrieve/{id}`
Retrieves the ciphertext of a box.
- **Headers**: `X-Inbox-Alias` (if recipient).
- **Auth**: Must be Owner or Recipient of the scoped inbox.

### 4.3 `GET /inbox/{alias}`
Lists active boxes for the authenticated DID in the specified alias.

### 4.4 `POST /extend/{id}`
Adds time to an existing lease.
- **Body**: `{ additionalHours }`
- **Payment**: Required (x402).

---

## 5. Metadata Retention

Nodes only store the minimum metadata required to enforce the lease and allow discovery:
- `storage_id` (UUID)
- `owner_hash` (Salted DID Hash)
- `recipient_hash` (Salted DID Hash)
- `size_bytes`
- `expires_at`

---

## 6. Conformance & Testing

Implementations are considered protocol-compliant if they pass the mandatory conformance suite:
1. **Economic Integrity**: Correct 402 rejection and Satoshi calculation.
2. **Cryptographic Isolation**: No cross-alias inbox leakage.
3. **Temporal Persistence**: Immediate 410 response upon expiry.
4. **Sovereign Access**: Proper DID-based authorization enforcement.

---

**Version:** 0.1.0  
**Status:** Working Draft  
**Reference Implementation:** [src/index.ts](src/index.ts)
