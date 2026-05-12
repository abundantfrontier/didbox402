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

---

## 5. API Specification

### 5.1 Error Codes
Compliant nodes MUST use the following standardized error codes:
- `401 Unauthorized`: Missing or invalid DID signature/timestamp.
- `402 Payment Required`: Missing or invalid payment proof.
- `403 Forbidden`: Authenticated DID lacks permission for the resource.
- `410 Gone`: Resource lease has expired.
- `413 Payload Too Large`: Payload exceeds node limits (SHOULD be 10MB+).

### 5.2 Endpoints

#### `POST /store`
Creates a new storage lease.
- **Request Body:** `{ ciphertext: string, durationHours: number, recipientDid?: string, inboxAlias?: string }`
- **Fulfillment:** Requires `Authorization: L402 ...` or `PAYMENT-SIGNATURE: ...`.

#### `GET /retrieve/{id}`
Retrieves box content.
- **Headers:** `X-Inbox-Alias` (REQUIRED if caller is a recipient of a scoped inbox).

---

## 6. Metadata Privacy

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
