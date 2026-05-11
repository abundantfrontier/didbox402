# didbox402 Protocol Specification (v0.2.1)

**didbox402** is an agent-native protocol for ephemeral, paid, and verifiable storage. It facilitates trustless data handoff between autonomous entities using Decentralized Identifiers (DIDs) and micropayments.

---

## 1. Introduction

### 1.1 Design Goals
- **Autonomy:** Agents should be able to lease storage without human intervention, accounts, or credit cards.
- **Privacy:** Minimize metadata leakage and enforce client-side encryption.
- **Scalability:** Hands-off scaling via stateless, edge-native architecture.
- **Verifiability:** Every transaction is cryptographically signed and economically verified.

### 1.2 Non-Goals
- **Permanent Storage:** didbox402 is NOT a replacement for Arweave or IPFS persistence.
- **Content Discovery:** The protocol does not support global search of stored ciphertext.

---

## 2. Authentication (The Shield)

Every request to a didbox402 node MUST be authenticated via DID signatures.

### 2.1 Supported Identity
- **did:key:** Specifically supports **Ed25519 (z6Mk)** identity keys.
- **Headers:**
  - `X-DID`: The Decentralized Identifier (e.g., `did:key:z6Mkp...`).
  - `X-DID-Signature`: A hex-encoded Ed25519 signature of the request hash.

### 2.2 Signature Binding (Replay Protection)
To prevent tampering and replay attacks, the signature MUST cover the **Request Hash**:
`SHA256(Method + Path + Body_Hash)`

Where `Body_Hash` is `SHA256(Raw_Body_Text)`. If the request has no body, the hash of an empty string is used.

---

## 3. Economics (The Rail)

Resource allocation is governed by the **402 Payment Required** standard using the **Lightning Network**.

### 3.1 Dynamic Pricing
Storage cost is calculated as:
`Total_Cost = Math.max(1MB, Size) * Duration_Hours * Base_Rate`

### 3.2 The x402 Handshake (Discovery-Challenge-Settlement)
1. **Discovery:** Client sends a request without `X-Payment`.
2. **Challenge:** Server responds with `402 Payment Required` and an `X-Invoice` header (BOLT11).
3. **Settlement:** The agent pays the invoice and receives a **preimage**.
4. **Fulfillment:** The agent retries the request with `X-Payment: {preimage}`.

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
Lists active boxes for the authenticated DID in the specified alias (default: `default`).

### 4.4 `POST /extend/{id}`
Adds time to an existing lease.
- **Body**: `{ additionalHours }`
- **Payment**: Required (x402).

---

## 5. Metadata Privacy (The Shadow)

Inboxes are isolated via **Salted DID Hashing**. The server never stores raw recipient DIDs in the lookup index.
`Inbox_ID = SHA256(Recipient_DID + Alias + Service_Salt)`

---

## 6. Conformance

Implementations MUST pass the conformance suite in `packages/server/src/__tests__`.

---
**Version:** 0.2.1  
**Status:** Alpha Draft
