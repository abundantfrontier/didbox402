# didbox402 Protocol Specification (v0.9.1)

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

didbox402 nodes MUST enforce resource allocation using a **`billing_mode`** advertised in discovery:

| `billing_mode` | Settlement |
|----------------|------------|
| `micropayment` (default) | **402 Payment Required** + L402 and/or x402 |
| `entitlement` | Org API key via `X-DIDBOX-Entitlement`; missing/invalid → **403** |

**DID authentication is unchanged** in both modes. `billing_mode` is per-node; clients MUST read discovery for each endpoint URL and branch accordingly. A single client MAY talk to micropayment public nodes and entitlement internal nodes concurrently.

### 4.1 Payment Rails (Micropayment Mode)
When `billing_mode` is `micropayment`, a node **MUST** support at least one payment rail and **SHOULD** support both:

- **L402 (Lightning Network):** Satoshis with Macaroon-based authentication.
- **x402 (Web3/Stablecoin):** USDC stablecoin settlement (e.g., Base chain).

**Partial Rail Support:** A node MAY advertise support for only a subset of rails (e.g., `["x402"]` only) in its discovery response. Such nodes remain fully compliant provided they correctly implement the rails they advertise. Clients MUST only use rails that the node has advertised as supported. Conformance testing SHOULD be limited to the rails declared in `supported_rails`.

### 4.2 Standardized Challenges (Micropayment Mode)
When `billing_mode` is `micropayment`, nodes MUST respond to unpaid billable requests with `402 Payment Required` and the following headers:
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

**402 response body:** The normative challenge is carried in the headers above. Nodes **MAY** include a JSON body (e.g. `error`, `amount_satoshis`, `protocols`) for client convenience; clients MUST NOT require a specific JSON body schema to detect or settle payment. All other 4xx/5xx responses use the normative envelope in §5.1.

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

**Storage sizing and price (MUST be used by servers):**
```
storageBytes = len(base64decode(ciphertext))
storageMb    = max(min_charge_mb, ceil(storageBytes / 1048576))
storageCost  = storageMb * durationHours * base_rate_per_mb_hour
finalCost    = ceil(storageCost)
```

**Egress sizing and price (when `egress_rate_per_mb` > 0):**
```
transferBytes = octets in the successful GET /retrieve/{id} response body
transferMb    = max(min_charge_mb, ceil(transferBytes / 1048576))
egressCost    = ceil(transferMb * egress_rate_per_mb)
```

- `min_charge_mb` is **operator-configurable**. Implementations **SHOULD** publish their configured value in `GET /price` and `/.well-known/didbox-configuration`. A value of `1` is **RECOMMENDED** for standard blob storage; memory-backed or enterprise tiers **MAY** use a lower floor.
- `storageBytes` and `transferBytes` measure different things. Egress billing MUST use `transferBytes`, not stored blob size.
- `durationHours` MUST be a positive integer ≥ 1.
- `egress_rate_per_mb` (default 0) **MAY** be charged on successful `GET /retrieve/{id}`. When `billing_mode` is `micropayment` and the configured rate > 0, servers MUST return 402 before delivering the payload, using the egress formula above.
- Providers MAY choose to absorb egress costs (`egress_rate_per_mb = 0`) as a competitive decision.
- When `billing_mode` is `micropayment`, the values returned by `GET /price` **MUST** be used to compute the 402 challenge amount for that specific request.
- **`pricing_mode`:** Nodes advertise `"public"` (default) or `"authenticated"` in discovery. When `"public"`, `GET /price` works without DID headers. When `"authenticated"`, unauthenticated `GET /price` returns `401`, and the authenticated rates MUST be used for subsequent 402 challenges.
- A node **MAY** return different pricing based on the authenticated DID when `pricing_mode` is `"authenticated"` (e.g., volume discounts, partner tiers). Those returned values MUST be used for the subsequent paid operation.

### 4.6 Entitlement Billing (Enterprise Internal — Phase 1)

**Trust model:** Entitlement nodes trade permissionless micropayment for **org-governed access**. Agent identity and E2EE remain client-driven (§1.1); storage **allocation** is gated by operator-issued secrets. This profile is intended for **private / enterprise** deployments, not public commodity nodes.

**Phase 1 limitation:** Entitlement API keys are **org-wide bearer credentials**. They are **not** bound to a specific agent DID — any caller with a valid key and any valid DID signature may consume org quota. Per-DID scoping is deferred to Phase 2 capability tokens (see FUTURE.md).

When `billing_mode` is `"entitlement"`, nodes **MUST NOT** issue 402 challenges for billable operations. Instead:

1. **Discovery** MUST advertise:
   - `billing_mode: "entitlement"`
   - `supported_rails: []`
   - `entitlement` object with `methods`, `header`, and `key_format`

2. **Client request** MUST include DID auth headers **and** a valid entitlement credential on the advertised header (default: `X-DIDBOX-Entitlement`).

3. **API key format (Phase 1):** `dbx_ent_<id>.<secret>`
   - `<secret>` MUST be ≥128 bits of cryptographically random entropy.
   - Servers MUST store only `SHA-256(secret)` per `<id>` in configuration (format: `ENTITLEMENT_KEY_HASHES="id:sha256hex,id2:sha256hex"`). Raw secrets MUST NOT appear in logs, discovery, persistent storage, or source control.
   - Servers MUST compare hashes in constant time.
   - Implementations MUST NOT log the entitlement header or any substring of `<secret>`.
   - Operators MUST rotate keys by provisioning a new `<id>.<secret>`, distributing it, then revoking the old hash. Overlap windows (multiple active `<id>` entries) are RECOMMENDED for zero-downtime rotation. All replicas in a fleet MUST share identical hash configuration.

4. **Failure responses:**
   - Missing or invalid entitlement → `403 Forbidden` with `code: "ENTITLEMENT_REQUIRED"` (MUST).
   - DID authentication failures MUST still return `401` before entitlement is evaluated.
   - Clients MUST NOT interpret 402 on entitlement nodes as a payment challenge.

5. **Egress on entitlement nodes:** When `egress_rate_per_mb` > 0, a valid entitlement credential on the retrieve request satisfies egress billing (no 402). `/price` egress values are informational for chargeback only.

6. **Quota (Phase 1):** The protocol does not define per-key quotas. Operators SHOULD enforce limits out-of-band (ingress, disk caps, WAF) until Phase 2 quota accounting (see FUTURE.md).

7. **Success receipts** on billable operations MUST include:
   ```json
   { "amountPaid": "0", "currency": "none", "rail": "entitlement" }
   ```

8. **`GET /price`** MAY still return rate cards for internal chargeback reporting; those values are informational only and MUST NOT trigger 402 on entitlement nodes.

**Conformance:** Entitlement behavior is validated by a separate **enterprise-internal** profile (§10.1). Micropayment conformance remains unchanged.

---

## 5. API Specification

### 5.1 Error Codes
Compliant nodes MUST use the following standardized error codes for the core conditions listed below. Nodes **MAY** return additional custom short codes (e.g., `"RATE_LIMITED"`, `"STORAGE_BACKEND_DEGRADED"`, `"MAINTENANCE_MODE"`, `"QUOTA_EXCEEDED"`) for operational conditions. Clients **MUST** treat unknown `code` values gracefully.

**Core Normative Error Codes:**
- `400 Bad Request`: Malformed request body, invalid `durationHours`, or other validation errors.
- `401 Unauthorized`: Missing or invalid DID signature/timestamp.
- `402 Payment Required`: Missing or invalid payment proof (micropayment mode only).
- `403 Forbidden`: Request denied after successful DID authentication. Use `code` to distinguish:
  - `ENTITLEMENT_REQUIRED` — missing or invalid org entitlement credential (entitlement mode billable operations).
  - `ACCESS_DENIED` — authenticated DID lacks permission for the specific resource (e.g. retrieve ACL).
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
- `ciphertext` MUST be a base64-encoded string of the client-encrypted bytes. Invalid base64 MUST be rejected with `400`.
- `sizeBytes` reported in responses and used for storage pricing is the decoded byte length of `ciphertext`.
- `max_payload_bytes` in discovery applies to decoded `storageBytes`.
- **Response (200 OK):**
```json
{
  "storageId": "uuid",
  "expiresAt": "ISO8601-Timestamp",
  "sizeBytes": 1234,
  "amountPaid": "1000",
  "currency": "sats",
  "rail": "L402",
  "pricePaidSatoshis": 1000
}
```
- `amountPaid`, `currency`, and `rail` are normative. `pricePaidSatoshis` is a deprecated alias when `rail` is `L402`.

#### `GET /retrieve/{id}`
Retrieves box content.
- **Headers:** `X-Inbox-Alias` (REQUIRED if caller is a recipient of a scoped inbox).
- When `billing_mode` is `micropayment` and `egress_rate_per_mb` > 0, servers MUST issue a 402 challenge based on `transferBytes` before returning the payload. On entitlement nodes, a valid entitlement credential satisfies egress billing (§4.6).
- **Response (200 OK):**
```json
{
  "ciphertext": "string"
}
```

#### `DELETE /store/{id}`
Allows the lease owner to purge a box before lease expiry.
- Caller MUST be the owner (verified via salted owner hash).
- Returns `204 No Content` on success.
- Returns `404` if not found or caller is not the owner (privacy-preserving).
- Returns `410` if the lease has already expired.
- **No rebate** is issued for unused lease time.

#### `POST /extend/{id}`
Extends an existing lease.
- **Request Body:** `{ "additionalHours": 24 }`
- **Response (200 OK):**
```json
{
  "storageId": "uuid",
  "newExpiresAt": "ISO8601-Timestamp",
  "amountPaid": "500",
  "currency": "sats",
  "rail": "L402",
  "additionalCostSatoshis": 500
}
```

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
- **Response (200 OK):** `{ "alias": "project-x", "hashedId": "...", "amountPaid": "1000", "currency": "sats", "rail": "L402", "feePaid": 1000 }`

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
- `POST /store` accepts any `inboxAlias` string (including previously unused values). Storing to a previously unseen alias **implicitly creates** the inbox (no `inbox_creation_fee` is charged at store time).
- `POST /inboxes` is **optional** and is primarily used when an operator wants to charge the `inbox_creation_fee` upfront or explicitly provision named inboxes.
- `GET /inbox/{alias}` and `GET /retrieve/{id}` with `X-Inbox-Alias` work for any alias that was used at store time.
- The `default` inbox always exists implicitly.

**Group Communication Note:** Multiple DIDs can write to the same inbox alias. A common client-side pattern for secure group communication is for each participant to sign messages with their own DID while encrypting content with a shared group key. This pattern requires no protocol changes. See `docs/designs/group-communication-design.md` for details.

**Note on Administrative Endpoints:**
The reference implementation exposes `GET /janitor/purge` (protected by `X-Admin-Token` or `DEV_MODE`). This endpoint is **not** part of the public protocol and implementers may implement automatic purge via cron, Durable Object alarms, or other background mechanisms instead.

### 5.5 Cross-Node Data Movement (Client-Only)

Moving a box between nodes is a **client-orchestrated** activity. The protocol defines no server-side migration endpoints.

**Normative client flow:**
1. `GET /retrieve/{id}` on the source node (owner or authorized recipient).
2. `POST /store` on the destination node with the retrieved ciphertext.

This preserves privacy: no cross-node authorization artifacts, linkable proofs, or destination-node awareness of the source.

SDKs **MAY** provide a `migrate()` convenience wrapper around the two steps above.

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
  "protocol_version": "0.9.1",
  "billing_mode": "micropayment",
  "supported_rails": ["L402", "x402"],
  "pricing_mode": "public",
  "limits": {
    "max_payload_bytes": 10485760,
    "max_lease_hours": 8760,
    "min_charge_mb": 1
  },
  "endpoints": {
    "store": "/store",
    "retrieve": "/retrieve/{id}",
    "extend": "/extend/{id}",
    "delete": "/store/{id}",
    "inbox": "/inbox/{alias}",
    "inboxes": "/inboxes",
    "leases": "/leases",
    "price": "/price"
  },
  "node_identity": {
    "did": "did:key:z6Mk...",
    "public_key": "z6Mk..."
  }
}
```

**Entitlement node example:**
```json
{
  "protocol_version": "0.9.1",
  "billing_mode": "entitlement",
  "supported_rails": [],
  "pricing_mode": "authenticated",
  "entitlement": {
    "methods": ["api_key"],
    "header": "X-DIDBOX-Entitlement",
    "key_format": "dbx_ent_<id>.<secret>"
  },
  "limits": { "max_payload_bytes": 10485760, "max_lease_hours": 8760, "min_charge_mb": 1 },
  "endpoints": { "store": "/store", "retrieve": "/retrieve/{id}", "extend": "/extend/{id}", "delete": "/store/{id}", "inbox": "/inbox/{alias}", "inboxes": "/inboxes", "leases": "/leases", "price": "/price" }
}
```

**Field and Naming Rules:**
- `protocol_version` (string) — the exact protocol version the node implements.
- `billing_mode` (string) — `"micropayment"` (default) or `"entitlement"`.
- `pricing_mode` (string) — `"public"` (default) or `"authenticated"`.
- `entitlement` (object) — REQUIRED when `billing_mode` is `"entitlement"`; MUST be omitted otherwise.
- `node_identity` (object) — OPTIONAL. Clients MUST NOT require it.
- `limits.min_charge_mb` reflects the operator's configured billing floor (RECOMMENDED default: `1`).
- All fields in this response and in `GET /price` use `snake_case`.
- All other API request/response bodies use `camelCase`.
- Clients MUST ignore unknown fields.
- Path templates use OpenAPI-style `{param}` (not `:param`).

A machine-readable **OpenAPI 3.1** description of the full protocol is available at `docs/didbox402-openapi.yaml`. Implementers are strongly encouraged to use it for client and server generation.

### 7.2 Node Identity (Optional)

Nodes **MAY** publish an optional `node_identity` in discovery for operator reputation, future extensions, or signed operational attestations.

- When present, the identity **MUST** be expressed as a `did:key` (Ed25519 only).
- The signing key **SHOULD** be kept separate from administrative or operational keys.
- Clients **MUST** treat `node_identity` as optional and MUST NOT require it for core storage operations.

**Node Identity Object:**

```json
{
  "did": "did:key:z6Mk...",
  "public_key": "z6Mk..."
}
```

- `did`: The node's Decentralized Identifier in `did:key` format.
- `public_key`: The base58btc multibase encoding of the raw 32-byte Ed25519 public key (same encoding used in the DID).

---

## 8. Versioning & Compatibility

didbox402 follows semantic versioning for the protocol.

### 8.1 Backward Compatibility
- **Minor Updates:** MUST remain backward compatible with existing clients.
- **Major Updates:** MAY introduce breaking changes. Nodes SHOULD support the previous major version for a transition period.

---

## 9. Client Requirements

While most normative requirements in this document are written for nodes, certain behaviors are mandatory (or strongly recommended) for any client that interacts with the protocol. These are divided into two categories for clarity.

### 9.1 Normative Client Obligations

The following requirements apply to all clients and SDKs. Failure to implement them correctly will result in interoperability failures or security issues. Conformance testing for clients focuses on these behaviors.

- **Signature Construction:** Clients MUST compute the request hash exactly as defined in §3.2 (double SHA-256 with `bodyHashHex`) and sign the resulting bytes with Ed25519. The reference implementation lives in `@didbox/sdk-crypto`.
- **Freshness and Replay Protection:** Every request MUST use a fresh `X-DID-Timestamp` (within the 5-minute drift window) and a unique signature. Clients MUST NOT reuse signatures.
- **Inbox Alias Handling (as recipient):** When retrieving or listing items sent to a non-default `inboxAlias`, the client MUST supply the `X-Inbox-Alias` header (or use the alias in the URL path). Owners retrieving their own items may omit the header.
- **Ciphertext Encoding:** Clients MUST base64-encode the client-encrypted payload before sending in `POST /store`.
- **Discovery per endpoint:** Clients MUST fetch `/.well-known/didbox-configuration` for each node base URL and treat omitted `billing_mode` as `micropayment`.
- **Entitlement mode:** When `billing_mode` is `entitlement`, clients MUST attach a valid credential on the header advertised in `entitlement.header` (default `X-DIDBOX-Entitlement`) for every billable operation. Clients MUST NOT invoke micropayment settlement (402 handlers) on entitlement nodes.
- **Micropayment mode:** When `billing_mode` is `micropayment`, clients MUST use only rails listed in `supported_rails` when settling 402 challenges.

### 9.2 Recommended Client SDK Capabilities

The following are **not normative protocol requirements**. They represent strong recommendations for any high-quality client library or SDK that aims to provide a good developer and agent experience on top of the core protocol.

Official and third-party SDKs **SHOULD** provide ergonomic abstractions for these areas so that application code (especially autonomous agents and LLM tool-calling environments) does not need to implement low-level ceremony for every operation:

- Automatic 402 challenge handling and payment negotiation (with pluggable wallet / rail providers for L402 and x402), including retry after successful settlement.
- High-level `DidBoxClient` (or equivalent) that encapsulates signing, discovery, and common operations.
- Cross-node helpers (`migrate`, `DidBoxClient.forNode`) that wrap client-only retrieve + store flows.
- Lease lifecycle management (monitoring expiry, automatic or assisted extension, cost estimation using `/price`).
- Client-side resilience patterns, including conversation/thread mirroring into per-DID archives and reconciliation helpers (see the design document on Deletion Semantics and Client-Side Resilience).
- Group communication conveniences (helpers for the per-DID signing + shared symmetric key pattern) without requiring server changes.
- Clock drift detection and recovery using server `Date` headers.
- Safe key management utilities and DID handling (while keeping all private key material client-side).
- Discovery client that fetches and caches `/.well-known/didbox-configuration` and surfaces `billing_mode`, supported rails, and limits. SDKs SHOULD expose cache invalidation when node configuration may have changed.
- Entitlement credential injection per node URL (separate from agent DID keys), including cross-node `migrate()` with `destinationEntitlementKey` when the destination uses entitlement billing.

The reference packages (`@didbox/sdk-core`, `@didbox/sdk-crypto`, `@didbox/sdk-payments`) aim to implement the above recommendations. Application developers and agent frameworks are encouraged to build on these rather than re-implementing the low-level protocol details.

Implementers using the high-level `DidBoxClient` from `@didbox/sdk-core` inherit most of the normative behaviors in 9.1 when a correct `signRequest` function is supplied.

---

## 10. Conformance

Implementations MUST pass the official **[didbox-conformance](packages/conformance)** suite (version matching the `protocol_version` advertised in discovery).

### 10.1 Verification Gauntlet

Conformance is profile-based. All nodes MUST pass the **core** gauntlet. Additional items apply based on advertised `billing_mode`.

**Core (all nodes):**
1. **Cryptographic Isolation:** No cross-alias inbox leakage (different `inboxAlias` values produce isolated views).
2. **Temporal Security:** Enforces ±5m drift window and returns a `Date` header on every response.
3. **Replay Resistance (DID):** Rejects reused DID signatures within the drift window.
4. **Privacy Invariant:** Zero raw DIDs ever appear in persistent storage (`storage_records`, `inboxes`, `nonces`, `used_payments`) or in list responses.
5. **Ephemerality:** Automatic background purge of expired leases, ciphertext blobs, and expired nonces (≤ 1 hour granularity recommended).
6. **Discovery & Transport:** Public `/.well-known/didbox-configuration` returns the schema defined in §7.1 (including `billing_mode`); all responses include a valid `Date` header.

**Micropayment profile** (`billing_mode: micropayment`):
7. **Economic Integrity:** Rejects without payment via 402, applies `min_charge_mb`, uses `storageBytes` / `transferBytes`, and uses `/price` values for challenge amounts.
8. **Payment Replay Resistance:** Rejects reused L402 and x402 proofs.
9. **Billing guard:** Presenting only an entitlement header (without payment) does not bypass 402.

**Enterprise-internal profile** (`billing_mode: entitlement`):
7. **Entitlement gate:** Billable operations without valid entitlement return `403` with `code: ENTITLEMENT_REQUIRED` — never `402`.
8. **Empty rails:** `supported_rails` is `[]`; discovery includes `entitlement` object.
9. **Entitlement receipts:** Successful billable operations return `{ amountPaid: "0", currency: "none", rail: "entitlement" }`.

The conformance suite **MUST** exercise real Ed25519 signatures (via `@didbox/sdk-crypto` or equivalent). Micropayment nodes MUST additionally pass rail-specific payment tests. Entitlement nodes MUST pass the enterprise-internal profile.

**Reference:** The authoritative test cases live in `packages/server/src/__tests__/` and are progressively being ported into the published `@didbox/conformance` package. Implementers should run both the published CLI and the reference server test suite against their node.

### 10.2 Security Requirements
Implementations **MUST** align with the threat model documented in `docs/threat-model.html` (normative reference). In particular:

- `SERVICE_SALT` MUST be a high-entropy secret (≥128 bits, cryptographically random). It MUST NOT use the default values `"test_salt"` or `"default_salt"` in production. Nodes SHOULD refuse to start or log a loud warning if `SERVICE_SALT` matches a well-known default in non-DEV_MODE. The salt MUST NOT be committed to source control.
- **Rotation:** `SERVICE_SALT` is considered effectively immutable for the lifetime of a service. Rotating it would invalidate all existing `owner_hash` and `recipient_hash` values, breaking historical inboxes and lease queries. There is currently no supported rotation mechanism. Operators SHOULD treat the salt as a long-lived secret. Future versions of the protocol may introduce versioning or migration support for salt rotation.
- Raw `recipientDid` values received in `POST /store` bodies MUST NOT be logged or persisted beyond the immediate hash computation.
- When `billing_mode` is `entitlement`, nodes MUST configure at least one entry in `ENTITLEMENT_KEY_HASHES` before serving billable traffic in non-`DEV_MODE` environments. Nodes SHOULD refuse to start or return `500` with a clear configuration error if entitlement mode is enabled with an empty hash list.
- Entitlement secrets MUST meet the entropy requirements in §4.6. The entitlement header MUST NOT appear in application or access logs.
- The janitor/admin purge mechanism (if exposed via HTTP) MUST be protected by a strong secret or DID-based ACL.

---

## 11. Future Work

The following areas are planned for future versions of the protocol:

### 11.1 Cross-Node Movement

Cross-node data movement is client-only (§5.5). Server-signed migration artifacts were removed in v0.8.0. Revisit only if implementors request verifiable portability with a concrete privacy model.

### 11.2 Group Communication (Exploratory)

A client-side pattern for secure multi-party communication has been explored. It allows groups of DIDs to share encrypted state while preserving individual authorship through per-DID signatures and a shared symmetric encryption key.

Key characteristics of this approach:
- No changes required on the server
- Sender pays for storage using the standard prepaid lease model
- Full cryptographic sovereignty (server sees only ciphertext)
- Provenance is maintained via individual DID signatures inside the encrypted blobs

This is documented in:
→ [Group Communication Design](docs/designs/group-communication-design.md)

This remains an area for future protocol extensions or higher-level SDK support.

---
**Version:** 0.9.1  
**Status:** Open Protocol Specification
