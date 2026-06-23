# Future Directions & Open Questions

This document captures strategic questions and potential directions for **didbox402** that go beyond the current scope of the protocol (as of v0.9.0). These topics are intended as areas for future exploration rather than committed roadmap items.

**Last reviewed:** 2026-06-22

---

## Core Foundation: Client-Driven Key Management

**A foundational principle of didbox402 is that key management is always client-driven.**

The protocol is explicitly designed so that:
1.  **Nodes hold no decryption keys:** Ciphertext stored on didbox402 is opaque to the node operator.
2.  **Nodes hold no signing keys for agents:** Identity is proven via DID signatures generated exclusively by the client/agent.
3.  **No Server-Side Key Escrow:** The protocol does not support or provide any mechanism for server-side key storage or recovery.

Any future evolution of the protocol MUST adhere to this principle of **Cryptographic Sovereignty**.

---

## Cross-Node Movement (Client-Only)

As of **v0.8.0**, cross-node data movement is **client-only**: `GET /retrieve` on the source node, then `POST /store` on the destination. Server-signed migration artifacts were removed to preserve privacy and reduce complexity.

Revisit server-side portability mechanisms only if implementors request them with a concrete privacy model. The withdrawn v0.7.0 design remains at [docs/designs/v070-sovereign-mobility-phase1.md](docs/designs/v070-sovereign-mobility-phase1.md) for historical reference.

---

## Multi-Node Federation

**How much (if any) federation should the core protocol support versus leaving to commercial layers?**

didbox402 is currently designed around independent nodes. However, as adoption grows, there may be value in allowing nodes to interoperate in limited ways.

### Key Questions
- Should the protocol define any mechanisms for nodes to discover or communicate with each other?
- To what extent should cross-node data access or coordination be supported natively?
- What are the privacy and security implications of introducing federation primitives?
- Should federation features be optional extensions, or should they remain entirely out of scope for the core protocol?

### Considerations
- Strong federation can increase complexity and attack surface significantly.
- Many federation-like features can be achieved through client coordination instead of protocol-level support.
- Commercial providers may have different incentives and trust models than the open protocol.

### Possible Directions to Explore
- Minimal capability discovery between nodes (already partially addressed via `/.well-known/didbox-configuration`)
- Optional federation extensions (kept separate from the core spec)
- Keeping federation concerns entirely in the commercial / application layer

---

## Agent-Native Features

**Should advanced agent features (auto-extend, session budgets, pre-authorized payments, etc.) stay in commercial products or eventually move into the protocol?**

Many powerful features for autonomous agents — such as automatic lease renewal, session-based credit systems, or pre-authorized spending — add significant convenience. However, they also increase the scope and complexity of the protocol.

### Key Questions
- What is the right boundary between core protocol functionality and commercial/product innovation?
- Which agent-centric features are fundamental enough that they should be standardized?
- How do we avoid bloating the protocol with features that only some users need?
- Should these features be implemented as optional extensions, or remain entirely in the domain of SDKs and commercial offerings?

### Considerations
- Keeping the protocol small and focused improves interoperability and auditability.
- Many advanced agent behaviors can be implemented client-side or through higher-level SDKs without protocol changes.
- Standardizing too early can limit experimentation by commercial providers.

### Possible Directions to Explore
- Define a clear set of “core protocol” vs “agent experience layer” responsibilities
- Create optional protocol extensions for common agent patterns
- Encourage advanced features to live primarily in SDKs and commercial implementations

---

## Commercial Operator Feedback (v0.7.0)

Feedback from early commercial implementers (e.g., didboxpro) has highlighted several areas that need better guidance for production multi-node deployments:

- **Node Identity in Fleets**: Optional `node_identity` for operator reputation; no migration proof requirement in v0.8.0.
- **SERVICE_SALT Rotation**: Currently treated as immutable. A future mechanism for safe rotation without breaking historical inboxes would be valuable.
- **Admin / Operational Surfaces**: Clearer guidance on authenticated admin endpoints (purge, maintenance mode, etc.).
- **Conformance for Commercial Products**: Interest in a lightweight certification or “verified provider” listing once nodes pass conformance.
- **Enterprise internal nodes (Phase 1 shipped in v0.9.0):** `billing_mode: entitlement` with `X-DIDBOX-Entitlement` API keys. See PROTOCOL.md §4.6.
- **Group Communication (Exploratory)**: A client-side pattern has been designed that allows groups to share encrypted state using individual DIDs for signing (provenance) and a shared symmetric key for confidentiality. The sender pays for storage. No server changes required. See the dedicated design document: `docs/designs/group-communication-design.md`. This is tracked as a post-v0.7.0 area of interest.

These topics are tracked for future design work. Commercial operator input is highly valued.

## Service Extensibility (Tiered Storage & Compute)

**How can the protocol support different classes of storage or deterministic compute services without breaking backward compatibility?**

didbox402 is designed to treat "Storage" as a generic resource lease. This model naturally extends to other types of agent-centric services.

### Tiered Storage Classes
A node could offer different performance or persistence tiers (e.g., `standard`, `mem-cache`, `encrypted-db`).
- **Discovery:** Nodes advertise available classes and their respective `base_rates` via `/.well-known/didbox-configuration`.
- **Request:** Clients specify a `storageClass` in the `POST /store` body.
- **Economics:** The server returns a 402 challenge with a price corresponding to the requested tier.

### Deterministic Compute Flows
The protocol can facilitate paid, deterministic work (e.g., data transformation, WASM execution) by treating compute as a service that produces a storage box.
- **Workflow:** 
  1. Client sends `POST /compute` with task parameters.
  2. Server returns a 402 challenge covering both the "Work" and the "Result Storage."
  3. Upon payment, the server executes the task and places the result in a box scoped to the client's DID.
  4. Client retrieves the result via the standard `GET /retrieve` or `GET /inbox` primitives.

### Possible Directions to Explore
- Standardizing a `service_type` registry in the protocol spec.
- Defining a "Compute-as-a-Box" pattern where task status is tracked via standard storage metadata.
- Exploring "Resource Negotiation" headers for real-time pricing of high-demand tiers.

---

## Enterprise Entitlement — Phase 2 (Future)

Phase 1 (v0.9.0) delivers per-node `billing_mode`, API-key entitlement, and a separate conformance profile. The following are **not** in scope for Phase 1 but are natural extensions:

### Signed Capability Tokens
- Org admin holds an `entitlement_issuer` key (published in discovery).
- Short-lived tokens encode `org`, `sub` (DID), allowed ops, and expiry — presented on `X-DIDBOX-Entitlement`.
- Enables delegation without server-side DID registries.

### DID Allowlists
- Operator-maintained allowlist of agent DIDs; entitlement inferred after DID auth with no extra header.
- Best for small, fixed agent fleets; poor fit for dynamic provisioning at scale.

### Hybrid Single-Node Billing
- One node accepts entitlement **or** 402 (e.g. employees vs external partners).
- Server tries entitlement first, falls back to micropayment rails.
- Requires `billing_mode: hybrid` and careful client semantics.

### Quota & Usage Accounting
- Even without monetary price, nodes need bytes-leased limits, rate limits, and per-org usage tables separate from `used_payments`.
- Responses MAY include `code: "QUOTA_EXCEEDED"` when limits are hit.

### Per-Storage-Class Entitlements
- Tie entitlement scope to `storageClass` (when tiered storage lands) so memory/cache tiers can have distinct keys or quotas.

### Ingress Integration (Non-Normative)
- OIDC, mTLS, or service-mesh gateways MAY inject `X-DIDBOX-Entitlement` at the edge. The core protocol does not define OIDC flows.

---

## How to Contribute to These Discussions

Feedback and ideas on these topics are welcome. As didbox402 matures, these questions may evolve into more concrete proposals or extensions. For now, they are documented as open areas of exploration to guide long-term thinking.
