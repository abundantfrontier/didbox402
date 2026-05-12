# didbox402 Protocol Specification (v0.4.0)

**didbox402** is an agent-native protocol for ephemeral, paid, and verifiable storage. It facilitates trustless data handoff between autonomous entities using Decentralized Identifiers (DIDs) and micropayments.

---

## 1. Introduction

### 1.1 Design Goals
- **Autonomy:** Agents lease storage without human intervention, accounts, or credit cards.
- **Privacy:** Absolute metadata obfuscation via salted hashing and E2EE.
- **Scalability:** Stateless, edge-native architecture.
- **Verifiability:** Cryptographically signed and economically verified.

### 1.2 Non-Goals
- **Permanent Storage:** didbox402 is NOT for persistent long-term storage.
- **Content Discovery:** No global search or indexing of ciphertext.

---

## 2. Authentication (The Shield)

Every request MUST be authenticated via DID signatures with temporal binding.

### 2.1 Supported Identity
- **did:key:** Supports **Ed25519 (z6Mk)**. Identity strings MUST follow Multibase (base58btc) and Multicodec (`0xed01`) standards.
- **Headers:**
  - `X-DID`: The Decentralized Identifier (e.g., `did:key:z6Mkp...`).
  - `X-DID-Signature`: Hex-encoded Ed25519 signature.
  - `X-DID-Timestamp`: Unix Epoch in milliseconds.

### 2.2 Signature Binding & Replay Protection
The signature MUST cover the **Temporal Request Hash**:
`SHA256(Timestamp + Method + Path + SHA256(Raw_Body))`

---

## 3. Economics (The Rail)

didbox402 v0.4.0 is a **Dual-Rail Protocol**, supporting both Bitcoin/Lightning and Web3/USDC payment standards.

### 3.1 Supported Standards
- **L402 (Lightning Network):** Bitcoin-native Satoshis.
- **x402 (Web3):** USDC Stablecoins on Base/Solana.

### 3.2 The x402 Handshake (Discovery-Challenge-Settlement)
1. **Discovery:** Client sends a request without payment headers.
2. **Challenge:** Server responds with **402 Payment Required** and protocol-specific headers:
   - **L402:** `WWW-Authenticate: L402 macaroon="...", invoice="..."`
   - **x402:** `PAYMENT-REQUIRED: {Base64 requirements}`
3. **Settlement:** The agent settles the payment on its preferred rail.
4. **Fulfillment:** The agent retries the request with proof:
   - **L402:** `Authorization: L402 <macaroon>:<preimage>`
   - **x402:** `PAYMENT-SIGNATURE: <cryptographic_proof>`

---

## 4. API Specification

### 4.1 `GET /price`
Discover node rates.
**Response:**
```json
{
  "base_rate_per_mb_hour": 100,
  "inbox_creation_fee": 1000,
  "supported_rails": ["L402", "x402"]
}
```

### 4.2 `POST /store`
Leases a new storage box.
- **Body**: `{ ciphertext, durationHours, recipientDid?, inboxAlias? }`
- **Auth**: Required.
- **Payment**: Required (L402 or x402).

### 4.3 `GET /retrieve/{id}`
Retrieves box ciphertext.

---

## 5. Metadata Privacy (The Shadow)

All lookup indexes are stored as salted hashes. The server never stores raw recipient DIDs.
`Identity_Hash = SHA256(Recipient_DID + Alias + Service_Salt)`

---

## 6. Conformance

Implementations MUST pass the automated test suite in `packages/server/src/__tests__`.

---
**Version:** 0.4.0  
**Status:** Unified Beta (Working Draft)
