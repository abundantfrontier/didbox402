# didbox402 Protocol Specification (v0.3.0)

**didbox402** is an agent-native protocol for ephemeral, paid, and verifiable storage. It facilitates trustless data handoff between autonomous entities using Decentralized Identifiers (DIDs) and micropayments.

---

## 1. Introduction

### 1.1 Design Goals
- **Autonomy:** Agents should be able to lease storage without human intervention, accounts, or credit cards.
- **Privacy:** Absolute metadata obfuscation via salted hashing and client-side encryption.
- **Scalability:** Stateless, edge-native architecture designed for billions of objects.
- **Verifiability:** Cryptographically signed and economically verified transactions.

### 1.2 Non-Goals
- **Permanent Storage:** didbox402 is NOT for persistent long-term storage (see Arweave/IPFS).
- **Content Discovery:** No global search or indexing of ciphertext.

---

## 2. Authentication (The Shield)

Every request MUST be authenticated via DID signatures with temporal binding.

### 2.1 Supported Identity
- **did:key:** Supports **Ed25519 (z6Mk)**. Identity strings MUST follow the Multibase (base58btc) and Multicodec (`0xed`) standards.
- **Headers:**
  - `X-DID`: The Decentralized Identifier (e.g., `did:key:z6Mkp...`).
  - `X-DID-Signature`: Hex-encoded Ed25519 signature.
  - `X-DID-Timestamp`: Unix Epoch (milliseconds).

### 2.2 Signature Binding & Replay Protection
The signature MUST cover the **Temporal Request Hash**:
`SHA256(Timestamp + Method + Path + SHA256(Raw_Body))`

**Verification Rules:**
1. Servers MUST reject requests with a timestamp drift > 5 minutes from `now`.
2. Servers SHOULD implement nonce tracking for maximum replay resistance.

---

## 3. Economics (The Rail)

Resource allocation uses the **402 Payment Required** standard over the **Lightning Network**.

### 3.1 Dynamic Pricing
Storage cost is calculated as:
`Total_Cost = Math.max(1MB, Size) * Duration_Hours * Base_Rate`

### 3.2 The x402 Handshake
1. **Discovery:** Client sends a request without `X-Payment`.
2. **Challenge:** Server responds with `402 Payment Required` and an `X-Invoice` header (BOLT11).
3. **Settlement:** The agent pays the invoice and receives a **preimage**.
4. **Fulfillment:** The agent retries the request with `X-Payment: {preimage}`.

---

## 4. API Specification

### 4.1 `POST /store`
Leases a new storage box.
- **Body**: `{ ciphertext, durationHours, recipientDid?, inboxAlias? }`

### 4.2 `GET /retrieve/{id}`
Retrieves box ciphertext.
- **Headers**: `X-Inbox-Alias` (if recipient).
- **Auth**: Must be Owner or Recipient of the specific scoped inbox.

### 4.3 `GET /inbox/{alias}`
Lists active boxes for the authenticated DID in the scoped alias (default: `default`).

---

## 5. Metadata Privacy (The Shadow)

All lookup indexes (ownership and discovery) are stored as salted hashes. The server never stores raw recipient DIDs.
`Identity_Hash = SHA256(Recipient_DID + Alias + Service_Salt)`

---

## 6. Conformance

Implementations MUST pass the automated test suite in `packages/server/src/__tests__`.

---
**Version:** 0.3.0  
**Status:** Beta Draft
