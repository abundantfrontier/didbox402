# Future Directions & Open Questions

This document captures strategic questions and potential directions for **didbox402** that go beyond the current scope of the protocol (as of v0.6.1). These topics are intended as areas for future exploration rather than committed roadmap items.

---

## Core Foundation: Client-Driven Key Management

**A foundational principle of didbox402 is that key management is always client-driven.**

The protocol is explicitly designed so that:
1.  **Nodes hold no decryption keys:** Ciphertext stored on didbox402 is opaque to the node operator.
2.  **Nodes hold no signing keys for agents:** Identity is proven via DID signatures generated exclusively by the client/agent.
3.  **No Server-Side Key Escrow:** The protocol does not support or provide any mechanism for server-side key storage or recovery.

Any future evolution of the protocol MUST adhere to this principle of **Cryptographic Sovereignty**.

---

## Sovereign Mobility

**What does cross-node movement of boxes look like while preserving “client owns the keys”?**

One of the core principles of didbox402 is that **clients retain full control of their cryptographic keys**. This creates interesting challenges when considering the movement of stored data between independent nodes.

A detailed design for the first phase of Sovereign Mobility has been developed:

→ **[v0.7.0 Sovereign Mobility – Phase 1 (Minimal Migration) Design](docs/designs/v070-sovereign-mobility-phase1.md)**

### Key Questions (from earlier exploration)
- How can a box (or its lease) be transferred from one didbox node to another without the client having to re-upload the data?
- What cryptographic or authorization mechanisms would allow a new node to verify ownership of an existing box?
- Should box migration be a first-class protocol feature, or should it be handled entirely at the client or commercial layer?
- How do we maintain privacy and unlinkability during and after a move?

### Current Direction (v0.7.0 Phase 1)
The current approach favors a **client-mediated model** with a signed **Migration Authorization** issued by the source node. Key characteristics:
- Data movement remains client-side.
- The Migration Authorization is generic and third-party verifiable.
- Destination nodes are not required to understand migrations in Phase 1.
- Strong emphasis on extensibility for future enhanced flows (e.g., lease matching when presenting the authorization to the destination node).

### Considerations
- Any migration mechanism must not require the client to reveal private keys to nodes.
- There is value in time-limited, signed migration proofs.
- Commercial providers may want different policies around data portability and migration incentives.

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

## How to Contribute to These Discussions

Feedback and ideas on these topics are welcome. As didbox402 matures, these questions may evolve into more concrete proposals or extensions. For now, they are documented as open areas of exploration to guide long-term thinking.
