# didbox402 Protocol Specification (v0.6.2)

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

1. **Binding (Normative Algorithm):**
   The value to sign is computed as:
   ```
   bodyBytes   = UTF8(Raw_Body)
   bodyHashHex = hex( SHA256(bodyBytes) )
   toSign      = SHA256( UTF8(Timestamp) || Method || Pathname || bodyHashHex )
   signature   = hex( Ed25519.sign(toSign, privateKey) )
   ```
   - `Pathname` MUST be the URL path component only (no query string or fragment).
   - `Timestamp` MUST be the decimal string of the millisecond Unix epoch (no leading zeros or padding).
   - The `X-DID-Signature` header contains the hex-encoded Ed25519 signature of `toSign`.

2. **Drift Window:** Servers MUST reject requests with a timestamp drift > 5 minutes.

3. **Nonce Tracking:** Servers MUST cache every signature within the 5-minute window and reject any re-used signature.

**Clock Skew Recommendations:**
- **Clients:** SHOULD synchronize with a reliable NTP source. If a request fails with a 401 due to drift, clients SHOULD attempt to re-sync or use the server's `Date` header to calculate local offset.
- **Servers:** MUST include a `Date` response header (RFC 7231 IMF-fixdate or ISO-8601) on **every** response, including all error responses (401, 402, 403, 410, 413, etc.).
- **Grace Period:** Implementations MAY allow a small buffer (e.g., ±5 seconds) beyond the 5-minute window to account for network latency. If a grace is implemented, it MUST be documented and applied uniformly to all requests.

**Implementation Note:** All SDKs and the conformance suite MUST use real Ed25519 signatures. Test-only bypasses (e.g. `mock_sig`) MUST NOT be present in production code paths.

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
  "amount": "string",          // USDC amount with 6 decimal places, e.g. "0.001234"
  "currency": "USDC",
  "network": "base|solana",
  "address": "string",
  "context": "string"          // optional, e.g. storage request hash or storageId
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
   - The transaction MUST be successful, match the expected `amount` (exact, including 6 decimals for USDC), `currency`, and `recipient address`, and the `txHash` MUST NOT have been used for any previous request (replay protection).

### 4.4 Payment Replay Protection (Normative for All Rails)
Servers **MUST** maintain a persistent store of used payment proofs (L402 `paymentHash`/`preimage` hash and x402 `txHash`) and **MUST** reject any previously-seen proof for a billable operation.

The store **MUST** retain entries for at least `max_lease_hours` (or until the associated lease(s) have expired plus a grace period).

Implementations using horizontal scaling **MUST** share this payment replay state across nodes (e.g. via D1 global replication, external ledger, or consistent routing).

**Recommended Schema (reference implementation):**
```sql
CREATE TABLE IF NOT EXISTS used_payments (
  payment_id TEXT PRIMARY KEY,   -- txHash (0x...) or L402 paymentHash
  rail TEXT NOT NULL,            -- 'L402' | 'x402'
  amount INTEGER NOT NULL,
  used_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_used_payments_expiry ON used_payments(expires_at);
```

### 4.5 Pricing Model (Normative)
All monetary values are expressed in the smallest unit of the rail (satoshis for L402, USDC with 6 decimal places for x402).

**Storage Price Calculation (MUST be used by servers):**
```
sizeMb = max(1, ceil(payloadBytes / 1048576))
cost   = sizeMb * durationHours * base_rate_per_mb_hour
finalCost = ceil(cost)
```

- `min_charge_mb = 1` (hard floor) is **mandatory** for all storage operations.
- `durationHours` MUST be a positive integer ≥ 1.
- `egress_rate_per_mb` (default 0) is charged on successful `GET /retrieve` only when the configured value > 0.
- The values returned by `GET /price` **MUST** be used to compute the 402 challenge amount for `/store`, `/extend/{id}`, and `/inboxes`.

---

## 5. API Specification

### 5.1 Error Codes
Compliant nodes MUST use the following standardized error codes:
- `400 Bad Request`: Malformed request body, invalid `durationHours`, or other validation errors.
- `401 Unauthorized`: Missing or invalid DID signature/timestamp.
- `402 Payment Required`: Missing or invalid payment proof.
- `403 Forbidden`: Authenticated DID lacks permission for the resource.
- `404 Not Found`: Resource does not exist (or access denied for privacy reasons).
- `410 Gone`: Resource lease has expired.
- `413 Payload Too Large`: Payload exceeds node limits (SHOULD be 10MB+).

**Error Response Body (Normative for all 4xx/5xx responses):**
```json
{ "error": "Human-readable message", "code": "OPTIONAL_SHORT_CODE" }
```
Servers MUST NOT leak internal implementation details (stack traces, database errors, etc.) in error responses.

### 5.2 Storage Operations

#### `POST /store`
Creates a new storage lease.
- **Request Body:**
```json
{
  "ciphertext": "string",   // base64-encoded bytes of client-side encrypted payload
  "durationHours": 24,
  "recipientDid": "did:key:z6Mk...",
  "inboxAlias": "default"
}
```
**Ciphertext & Size Rules:**
- `ciphertext` MUST be a base64-encoded string of the client-encrypted bytes.
- `sizeBytes` reported in responses and used for pricing is the decoded byte length (or the encoded string length for simplicity — servers MUST document their choice).
- `POST /store` measures size on the provided `ciphertext` value as UTF-8 bytes for the JSON string length limit.
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
Provisions a new named inbox for the authenticated DID. Requires a one-time creation fee.
- **Request Body:** `{ "alias": "project-x" }`
- **Response (200 OK):** `{ "alias": "project-x", "hashedId": "...", "feePaid": 1000 }`

#### `GET /inboxes`
Lists all named inboxes provisioned by the authenticated DID (no payment required for listing).
- **Response (200 OK):**
```json
{
  "inboxes": [
    { "alias": "project-x", "hashedId": "...", "createdAt": "ISO8601-Timestamp" }
  ]
}
```

**Inbox Alias Rules:**
- `POST /store` accepts any `inboxAlias` string (including previously unused values). Provisioning via `POST /inboxes` is **optional** for receiving; it is primarily an owner-side management and fee mechanism.
- `GET /inbox/{alias}` and `GET /retrieve/{id}` with `X-Inbox-Alias` work for any alias that was used at store time.
- The `default` inbox always exists implicitly.

**Note on Administrative Endpoints:**
The reference implementation exposes `GET /janitor/purge` (protected by `X-Admin-Token` or `DEV_MODE`). This endpoint is **not** part of the public protocol and implementers may implement automatic purge via cron, Durable Object alarms, or other background mechanisms instead.

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

The `/.well-known/didbox-configuration` endpoint **MUST** be publicly accessible without DID authentication headers (to enable autonomous client bootstrapping and discovery).

```json
{
  "protocol_version": "0.6.2",
  "supported_rails": ["L402", "x402"],
  "limits": {
    "max_payload_bytes": 10485760,
    "max_lease_hours": 8760,
    "min_charge_mb": 1
  },
  "endpoints": {
    "store": "/store",
    "retrieve": "/retrieve/{id}",
    "extend": "/extend/{id}",
    "inbox": "/inbox/{alias}",
    "inboxes": "/inboxes",
    "leases": "/leases",
    "price": "/price"
  }
}
```

**Field and Naming Rules:**
- `protocol_version` (string) — the exact protocol version the node implements.
- All fields in this response and in `GET /price` use `snake_case`.
- All other API request/response bodies use `camelCase`.
- Clients MUST ignore unknown fields.
- Path templates use OpenAPI-style `{param}` (not `:param`).

---

## 8. Versioning & Compatibility

didbox402 follows semantic versioning for the protocol.

### 8.1 Backward Compatibility
- **Minor Updates:** MUST remain backward compatible with existing clients.
- **Major Updates:** MAY introduce breaking changes. Nodes SHOULD support the previous major version for a transition period.

---

## 9. Client Requirements

While most normative requirements are written for nodes, the following obligations apply to clients and SDKs:

- **Signature Construction:** Clients MUST compute the request hash exactly as defined in 3.2 (double SHA-256 with `bodyHashHex`) and sign the resulting bytes with Ed25519. The official `@didbox/sdk-crypto` package provides the reference `signRequest` implementation.
- **Freshness:** Every request MUST use a fresh `X-DID-Timestamp` (within the 5-minute window) and a unique signature. Clients SHOULD never reuse a signature.
- **402 Handling:** On receiving 402, clients SHOULD parse both `WWW-Authenticate` (L402) and `PAYMENT-REQUIRED` (x402) and support at least one advertised rail. After successful payment, the client retries the original request with the appropriate proof header (`Authorization: L402 ...` or `PAYMENT-SIGNATURE`).
- **Inbox Alias Usage (as recipient):** When retrieving or listing items sent to a non-default `inboxAlias`, the client MUST supply the `X-Inbox-Alias` header (or use the alias in the URL path). Owners retrieving their own items may omit the header.
- **Clock Synchronization:** Clients SHOULD maintain NTP-synchronized clocks. On 401 drift errors, clients SHOULD read the `Date` response header and adjust future timestamps.
- **Discovery:** Clients SHOULD fetch `/.well-known/didbox-configuration` without auth headers and tolerate additional fields.
- **Ciphertext:** Clients MUST base64-encode the encrypted payload before sending in `POST /store`.

Implementers using the high-level `DidBoxClient` from `@didbox/sdk-core` inherit most of these behaviors when a correct `signRequest` function is supplied.

---

## 10. Conformance

Implementations MUST pass the official **[didbox-conformance](packages/conformance)** suite (version matching the `protocol_version` advertised in discovery).

### 10.1 Verification Gauntlet
Compliant nodes and the conformance suite MUST validate at minimum:

1. **Economic Integrity:** Rejects without payment, enforces 1MB min charge, and uses `/price` values to compute challenge amounts.
2. **Cryptographic Isolation:** No cross-alias inbox leakage (different `inboxAlias` values produce isolated views).
3. **Temporal Security:** Enforces ±5m drift window and returns a `Date` header on every response.
4. **Replay Resistance:** Rejects used DID signatures **and** used payment proofs (both L402 and x402).
5. **Privacy Invariant:** Zero raw DIDs ever appear in persistent storage (`storage_records`, `inboxes`, `nonces`, `used_payments`) or in list responses.
6. **Ephemerality:** Automatic background purge of expired leases, ciphertext blobs, and expired nonces (≤ 1 hour granularity recommended).
7. **Discovery & Transport:** Public `/.well-known/didbox-configuration` returns the exact schema defined in 7.1; all responses include a valid `Date` header.

The conformance suite **MUST** exercise real Ed25519 signatures (via `@didbox/sdk-crypto` or equivalent), dual-rail payment flows (including replay rejection), inbox isolation across multiple DIDs/aliases, and automatic purge behavior.

**Reference:** The authoritative test cases live in `packages/server/src/__tests__/` and are progressively being ported into the published `@didbox/conformance` package. Implementers should run both the published CLI and the reference server test suite against their node.

### 10.2 Security Requirements
Implementations SHOULD align with the threat model in `docs/threat-model.html`. In particular:

- `SERVICE_SALT` MUST be a high-entropy secret (≥128 bits). It MUST NOT use the default values `"test_salt"` or `"default_salt"` in production and MUST NOT be committed to source control.
- Raw `recipientDid` values received in `POST /store` bodies MUST NOT be logged or persisted beyond the immediate hash computation.
- The janitor/admin purge mechanism (if exposed via HTTP) MUST be protected by a strong secret or DID-based ACL.

---
**Version:** 0.6.2  
**Status:** Open Protocol Specification
