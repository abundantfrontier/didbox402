# didbox402: The Open Protocol for Agentic Storage

**"A vending machine for privacy."**

didbox402 is an agent-native open protocol for ephemeral, paid, and verifiable storage. It enables autonomous software entities (agents, LLMs) to lease temporary storage "boxes" using Decentralized Identifiers (DIDs) and standardized micropayments (L402 & x402).

---

## Status: v0.7.0 (Sovereign Mobility + Real Rails)

This repository serves as the definitive specification and reference ecosystem for the didbox402 standard.

### Core Features
- **Ephemeral Leases:** Storage is a time-bound lease. Data is automatically purged upon expiration.
- **Dual-Rail Standards:** Native support for **L402 (Lightning)** and **x402 (Web3/USDC)** payments.
- **Cryptographic Sovereignty:** Ed25519 authentication with strict temporal binding and replay protection.
- **Absolute Privacy:** Mandatory salted hashing ensures identity data is never discoverable.
- **Infrastructure Agnostic:** Designed to run on Cloudflare, AWS, GCP, or Bare Metal.

---

## Protocol vs. Product
**didbox402 is an open protocol.** This repository contains the standards and the reference implementation. 
Commercial providers build production services on top of this protocol, offering high-durability storage, enterprise compliance, and advanced agent toolkits.

---

## Repository Structure
- **`PROTOCOL.md`**: The official technical specification.
- **`ROADMAP.md`**: The public project roadmap.
- **`packages/conformance`**: The official Protocol Conformance CLI (recommended for validation).
- **`TESTING.md`**: Guidance on running tests and known limitations of the test harness.
- **`packages/server`**: The Cloudflare Workers reference node.
- **`packages/sdk-*`**: Reusable TypeScript modules for agents and clients.
- **`docs/`**: Comprehensive implementer guides and architectural documentation.

## Quick Start (v0.7.0)

### 1. Install Dependencies
```bash
npm install
```

### 2. Verify Compliance
Run the official conformance suite:
```bash
npx @didbox/conformance --help
```

### 3. Run the Reference Node
```bash
cd packages/server && npx wrangler dev
```

## Documentation
- **[Implementer's Guide](docs/implementer-guide.html)**: Building your own compliant node.
- **[Formal Specification](PROTOCOL.md)**: The definitive rulebook.
- **[Sovereign Mobility Design](docs/designs/v070-sovereign-mobility-phase1.md)**: Client-driven migration (v0.7.0).
- **[Client SDK Migration Design](docs/designs/v070-client-sdk-migration.md)**: `getMigrationProof()` and `migrate()` design.
- **[Migration Implementation Plan](docs/designs/v070-client-sdk-migration-implementation-plan.md)**: Detailed execution record.
- **[Extension Points](docs/extensions.html)**: How to customize and commercialize.
- **[Threat Model](docs/threat-model.html)**: Security considerations and mitigations.

## License
Open Core - Built at [adaptivefrontier.org](https://adaptivefrontier.org).
