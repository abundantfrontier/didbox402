# didbox402 Protocol Specification (v0.6.1)

**didbox402** is an agent-native open protocol for ephemeral, paid, and verifiable storage. It facilitates trustless data handoff between autonomous entities using Decentralized Identifiers (DIDs) and micropayments.

---

## 0. Protocol vs. Product

This document defines the **didbox402 Protocol**. It specifies the mandatory rules for authentication, economics, and storage that any compliant implementation MUST follow.

**Commercial products** (such as specialized hosting nodes or agent platforms) build on top of this protocol. Products MAY offer additional features (UI, dashboards, multi-chain rails) as long as they maintain compatibility with the core spec defined here.

---

## 1. Core Principles

### 1.1 Cryptographic Sovereignty
The provider is a "ghost." It holds no decryption keys. All data MUST be encrypted client-side before storage. Identity is proven per-request via DID-based signatures.

**Key management is strictly client-driven:** The protocol NEVER utilizes server-side keys for agent identity or data decryption. Nodes act purely as commodity storage utilities.

### 1.2 Ephemerality (Lease Model)
Storage is never permanent. It is a lease defined by `duration_hours`. Once the lease expires, the provider is obligated to purge the data.

---

## 2. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://tools.ietf.org/html/rfc2119).

---

## 3. Authentication (The Shield)

Every request to a didbox402 node MUST be authenticated via DID signatures with temporal binding.

### 3.1 Supported Identity
- **did:key:** Compliance requires support for **Ed25519 (z6Mk)** identities.
- **Headers:**
  - `X-DID`: The full DID string.
  - `X-DID-Signature`: Hex Ed25519 signature of the request hash.
  - `X-DID-Timestamp`: Unix Epoch in milliseconds (UTC).

### 3.2 Signature Binding & Replay Protection
Every signature MUST be unique and temporally bound.
1. **Binding:** Signature MUST cover `SHA256(Timestamp + Method + Path + SHA256(Raw_Body))`.
2. **Drift Window:** Servers MUST reject requests with a timestamp drift > 5 minutes.
3. **Nonce Tracking:** Servers MUST cache every signature within the 5-minute window and reject any re-used signature.

**Clock Skew Recommendations:**
- **Clients:** SHOULD synchronize with a reliable NTP source. If a request fails with a 401 due to drift, clients SHOULD attempt to re-sync or use the server's `Date` header to calculate local offset.
- **Servers:** MUST include a `Date` header in every response to help clients detect skew.
- **Grace Period:** Implementations MAY allow a small buffer (e.g., 5-10 seconds) beyond the 5-minute window to account for network latency.

---

## 4. Economics (The Rail)

didbox402 nodes MUST enforce resource allocation via the **402 Payment Required** status code.

### 4.1 Payment Rails
A node SHOULD support both:
- **L402 (Lightning Network):** Satoshis with Macaroon-based authentication.
- **x402 (Web3/Stablecoin):** USDC stablecoin settlement (e.g., Base chain).

### 4.2 Standardized Challenges
Nodes MUST respond to unpaid requests with `402 Payment Required` and the following headers:
- **L402:** `WWW-Authenticate: L402 macaroon="{base64}", invoice="{bolt11}"`
- **x402:** `PAYMENT-REQUIRED: {base64_json}`

**x402 Requirement JSON Schema:**
```json
{
  "amount": "string",
  "currency": "USDC",
  "network": "base|solana",
  "address": "string",
  "context": "string"
}
```

### 4.3 x402 Settlement Flow
The x402 rail enables push-based payments using Web3 rails (e.g., USDC on Base).
1. **Challenge:** Server returns `402` with the `PAYMENT-REQUIRED` header containing the recipient `address` and `amount`.
2. **Settlement:** Client broadcasts a transaction on the specified `network` transferring the exact `amount` to the `address`.
3. **Proof:** Client retries the request with the `PAYMENT-SIGNATURE` header.
4. **Verification:**
   - The `PAYMENT-SIGNATURE` MUST be the transaction hash (e.g., `0x...`).
   - The server MUST verify the transaction on-chain.
   - The transaction MUST be successful, match the expected `amount`, `currency`, and `recipient address`, and MUST NOT have been used for a previous request (replay protection).

---

## 5. API Specification

### 5.1 Error Codes
Compliant nodes MUST use the following standardized error codes:
- `401 Unauthorized`: Missing or invalid DID signature/timestamp.
- `402 Payment Required`: Missing or invalid payment proof.
- `403 Forbidden`: Authenticated DID lacks permission for the resource.
- `410 Gone`: Resource lease has expired.
- `413 Payload Too Large`: Payload exceeds node limits (SHOULD be 10MB+).

### 5.2 Storage Operations

#### `POST /store`
Creates a new storage lease.
- **Request Body:**
```json
{
  "ciphertext": "string",
  "durationHours": 24,
  "recipientDid": "did:key:z6Mk...",
  "inboxAlias": "default"
}
```
- **Response (200 OK):**
```json
{
  "storageId": "uuid",
  "expiresAt": "ISO8601-Timestamp",
  "sizeBytes": 1234,
  "pricePaidSatoshis": 1000
}
```

#### `GET /retrieve/{id}`
Retrieves box content.
- **Headers:** `X-Inbox-Alias` (REQUIRED if caller is a recipient of a scoped inbox).
- **Response (200 OK):**
```json
{
  "ciphertext": "string"
}
```

#### `POST /extend/{id}`
Extends an existing lease.
- **Request Body:** `{ "additionalHours": 24 }`
- **Response (200 OK):** `{ "storageId": "uuid", "newExpiresAt": "ISO8601-Timestamp", "additionalCostSatoshis": 500 }`

### 5.3 Economics & Discovery

#### `GET /price`
Returns current rates for storage and services.
- **Response (200 OK):**
```json
{
  "base_rate_per_mb_hour": 100,
  "inbox_creation_fee": 1000,
  "egress_rate_per_mb": 0,
  "min_charge_mb": 1
}
```

#### `GET /leases`
Lists all active leases created by the authenticated DID.
- **Response (200 OK):**
```json
{
  "leases": [
    {
      "id": "uuid",
      "sizeBytes": 1234,
      "expiresAt": "ISO8601-Timestamp",
      "recipientHash": "sha256(did+alias+salt)"
    }
  ]
}
```

### 5.4 Inbox Operations

#### `GET /inbox/{alias}`
Lists active boxes sent to the authenticated DID in the specified alias.
- **Response (200 OK):**
```json
{
  "alias": "default",
  "items": [
    { "id": "uuid", "sizeBytes": 1234, "expiresAt": "ISO8601-Timestamp" }
  ]
}
```

#### `POST /inboxes`
Provisions a new named inbox. Requires a one-time creation fee.
- **Request Body:** `{ "alias": "project-x" }`
- **Response (200 OK):** `{ "alias": "project-x", "hashedId": "...", "feePaid": 1000 }`

---

## 6. Metadata Privacy & Scoping

### 6.1 Inbox Scoping
Inboxes are cryptographically isolated. A recipient only sees items sent to a specific `alias` when they query `/inbox/{alias}`.
- **Default Inbox:** If no `inboxAlias` is specified during `POST /store`, the item is placed in the `default` inbox.
- **Isolation:** Knowing the ID of a box in one inbox does not grant access to boxes in another inbox, as access is verified via `Identity_Hash`.

### 6.2 Identity Hashing
Nodes MUST NOT store raw recipient DIDs in lookup indexes. All identifiers MUST be stored as salted hashes.
`Identity_Hash = SHA256(Recipient_DID + Alias + Service_Salt)`

---

## 7. Capability Discovery

Compliant nodes MUST advertise their capabilities at `/.well-known/didbox-configuration`.

### 7.1 Configuration Schema
```json
{
  "protocol_version": "0.6.1",
  "supported_rails": ["L402", "x402"],
  "limits": {
    "max_payload_bytes": 10485760,
    "max_lease_hours": 8760
  },
  "endpoints": {
    "store": "/store",
    "retrieve": "/retrieve/:id",
    "inbox": "/inbox/:alias",
    "leases": "/leases",
    "price": "/price"
  }
}
```

---

## 8. Versioning & Compatibility

didbox402 follows semantic versioning for the protocol.

### 8.1 Backward Compatibility
- **Minor Updates:** MUST remain backward compatible with existing clients.
- **Major Updates:** MAY introduce breaking changes. Nodes SHOULD support the previous major version for a transition period.

---

## 9. Conformance

Implementations MUST pass the official **[didbox-conformance](packages/conformance)** suite.

### 9.1 Verification Gauntlet
1. **Economic Integrity:** Rejects without payment, enforces 1MB min charge.
2. **Cryptographic Isolation:** No cross-alias inbox leakage.
3. **Temporal Security:** Enforces ±5m drift window.
4. **Replay Resistance:** Rejects used signatures (Nonce Tracking).
5. **Privacy Invariant:** Zero raw DIDs in persistent storage.

---
**Version:** 0.6.1  
**Status:** Open Protocol Specification
