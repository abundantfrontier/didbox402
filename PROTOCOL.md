# didbox402 Protocol Specification (v0.6.0)

**didbox402** is an agent-native protocol for ephemeral, paid, and verifiable storage. It facilitates trustless data handoff between autonomous entities using Decentralized Identifiers (DIDs) and micropayments.

---

## 1. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://tools.ietf.org/html/rfc2119).

---

## 2. Authentication (The Shield)

Every request to a didbox402 node MUST be authenticated via DID signatures with temporal binding.

### 2.1 Supported Identity
- **did:key:** Compliance requires support for **Ed25519 (z6Mk)** identities.
- **Headers:**
  - `X-DID`: The full DID string.
  - `X-DID-Signature`: Hex Ed25519 signature of the request hash.
  - `X-DID-Timestamp`: Unix Epoch in milliseconds (UTC).

### 2.2 Signature Binding & Replay Protection
The signature MUST cover the **Temporal Request Hash**:
`Hash = SHA256(Timestamp + Method + Path + SHA256(Raw_Body))`

**Verification Rules:**
1. Servers MUST reject requests with a timestamp drift > 5 minutes from the server's current time.
2. Servers MUST implement **Nonce Tracking**: caching every signature within the 5-minute window and rejecting any re-used signature.

---

## 3. Economics (The Rail)

didbox402 nodes MUST enforce resource allocation via the **402 Payment Required** status code.

### 3.1 Payment Rails
A node SHOULD support both:
- **L402 (Lightning Network):** Satoshis with Macaroon-based authentication.
- **x402 (Web3/Stablecoin):** USDC stablecoin settlement (e.g., Base chain).

### 3.2 Standardized Challenges
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

## 4. API Specification

### 4.1 Error Codes
Compliant nodes MUST use the following standardized error codes:
- `401 Unauthorized`: Missing or invalid DID signature/timestamp.
- `402 Payment Required`: Missing or invalid payment proof.
- `403 Forbidden`: Authenticated DID lacks permission for the resource.
- `410 Gone`: Resource lease has expired.
- `413 Payload Too Large`: Payload exceeds node limits (SHOULD be 10MB+).

### 4.2 Endpoints

#### `POST /store`
Creates a new storage lease.
- **Request Body:** `{ ciphertext: string, durationHours: number, recipientDid?: string, inboxAlias?: string }`
- **Fulfillment:** Requires `Authorization: L402 ...` or `PAYMENT-SIGNATURE: ...`.

#### `GET /retrieve/{id}`
Retrieves box content.
- **Headers:** `X-Inbox-Alias` (REQUIRED if caller is a recipient of a scoped inbox).

---

## 5. Metadata Privacy

Nodes MUST NOT store raw recipient DIDs in lookup indexes. All identifiers MUST be stored as salted hashes.
`Identity_Hash = SHA256(Recipient_DID + Alias + Service_Salt)`

---

## 6. Conformance

Implementations are considered compliant only if they pass the **Testing Gauntlet**:
1. **Economic Integrity:** Rejects without payment, enforces 1MB min charge.
2. **Cryptographic Isolation:** No cross-alias inbox leakage.
3. **Temporal Security:** Enforces ±5m drift window.
4. **Replay Resistance:** Rejects used signatures (Nonce Tracking).
5. **Privacy Invariant:** Zero raw DIDs in persistent storage.

---
**Version:** 0.6.0  
**Status:** Open Protocol Specification
