# didbox402 Protocol Specification (v0.1.0)

**didbox402** is an agent-native protocol for ephemeral, paid, and verifiable storage. It facilitates trustless data handoff between autonomous entities using Decentralized Identifiers (DIDs) and micropayments.

---

## 1. Introduction

### 1.1 Design Goals
- **Autonomy:** Agents should be able to lease storage without human intervention, accounts, or credit cards.
- **Privacy:** Minimize metadata leakage and enforce client-side encryption.
- **Scalability:** Hands-off scaling via stateless, edge-native architecture.
- **Verifiability:** Every transaction is cryptographically signed and economically verified.

### 1.2 Non-Goals
- **Permanent Storage:** didbox402 is NOT a replacement for Arweave or IPFS persistence. It is for ephemeral handoffs.
- **Content Discovery:** The protocol does not support global search or indexing of stored ciphertext.
- **Identity Management:** didbox402 uses DIDs but does not define how those DIDs are created or resolved.

---

## 2. Core Principles

### 2.1 Ephemerality (Lease Model)
Storage is never permanent. It is a lease defined by `duration_hours`. Once the lease expires, the provider is obligated to purge the data.

### 2.2 Cryptographic Sovereignty
The provider is a "ghost." It holds no decryption keys. All data MUST be encrypted client-side before storage. Identity is proven per-request via DID-based signatures.

### 2.3 Verifiable Economics (x402)
Resource allocation is governed by the 402 Payment Required standard. Nodes act as Lightning Service Providers (LSPs), requiring Satoshis (via Lightning Network) for storage and egress.

---

## 3. Authentication (The Handshake)

Every request to a didbox402 node MUST be authenticated.

### 3.1 Headers
- `X-DID`: The Decentralized Identifier of the caller.
- `X-DID-Signature`: A cryptographic signature of the request hash.
- `X-Payment`: (Conditional) The x402 payment proof (preimage).

### 3.2 Signature Binding
To prevent replay and tampering, the signature MUST cover the request hash:
`Hash(Method + Path + Body_Hash)`

---

## 4. Storage Mechanics

### 4.1 Inbox Isolation (Multi-Inbox)
A node supports multiple virtual inboxes per DID. Inboxes are identified by a salted hash:
`Inbox_ID = SHA256(Recipient_DID + Alias + Service_Salt)`

### 4.2 Dynamic Pricing
Storage cost is calculated as:
`Total_Cost = Math.max(1MB, Size) * Duration_Hours * Base_Rate`

---

## 5. API Specification

### 5.1 `POST /store`
Creates a new storage box.

**Request:**
```http
POST /store HTTP/1.1
X-DID: did:key:z6Mkp...
X-DID-Signature: base64(...)
X-Payment: preimage_abc123...

{
  "ciphertext": "...",
  "durationHours": 24,
  "recipientDid": "did:key:z6Mkf...",
  "inboxAlias": "project-alpha"
}
```

**Response (200 OK):**
```json
{
  "storageId": "uuid-v4-string",
  "expiresAt": "2026-05-12T13:00:00Z",
  "sizeBytes": 1024,
  "pricePaidSatoshis": 2400
}
```

### 5.2 `GET /retrieve/{id}`
Retrieves the ciphertext of a box.

**Request:**
```http
GET /retrieve/uuid-v4-string HTTP/1.1
X-DID: did:key:z6Mkf...
X-DID-Signature: base64(...)
X-Inbox-Alias: project-alpha
```

**Response (200 OK):**
```json
{
  "ciphertext": "..."
}
```

### 5.3 `GET /inbox/{alias}`
Lists active boxes for the authenticated DID.

**Response (200 OK):**
```json
{
  "alias": "project-alpha",
  "items": [
    {
      "id": "uuid-v4-string",
      "sizeBytes": 1024,
      "expiresAt": "2026-05-12T13:00:00Z"
    }
  ]
}
```

---

## 6. Conformance & Testing

Implementations are protocol-compliant if they pass the reference test suite:
1. **Economic Integrity**: Correct 402 rejection and Satoshi calculation.
2. **Cryptographic Isolation**: No cross-alias inbox leakage.
3. **Temporal Persistence**: Immediate 410 response upon expiry.
4. **Sovereign Access**: Proper DID-based authorization enforcement.

---

**Version:** 0.1.0  
**Status:** Working Draft  
**Reference Implementation:** [src/index.ts](src/index.ts)
