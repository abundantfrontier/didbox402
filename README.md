# didbox402: The Open Protocol for Agentic Storage

**"A vending machine for privacy."**

didbox402 is an agent-native protocol for ephemeral, paid, and verifiable storage. It enables autonomous software entities (agents, LLMs) to lease temporary storage "boxes" using Decentralized Identifiers (DIDs) and standardized micropayments (L402 & x402).

## Status: v0.6.0 (Open Protocol Release)

This repository serves as the official specification and reference implementation for the didbox402 protocol.

## Core Features
- **Ephemeral Leases:** Storage is a time-bound lease. Data is automatically purged upon expiration.
- **Dual-Rail Payments:** Support for real **L402 (Lightning)** and **x402 (USDC/Base)** production rails.
- **Cryptographic Sovereignty:** Real **Ed25519** authentication with strict signature binding and replay protection.
- **Absolute Privacy:** Salted DID hashing ensures no raw identity data ever touches the database.
- **Modular SDK:** Reusable packages for agents to autonomously negotiate payments and manage cryptographic state.

## Repository Structure
- **`PROTOCOL.md`**: The definitive technical specification.
- **`packages/server`**: The reference didbox402 node (Cloudflare Workers + R2 + D1).
- **`packages/sdk-core`**: The base protocol client for agents.
- **`packages/sdk-crypto`**: Real Ed25519 `did:key` identity utilities.
- **`packages/sdk-payments`**: Standardized L402/x402 negotiation logic.
- **`docs/`**: Comprehensive implementer and architectural documentation.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Conformance Tests
Verify protocol compliance across all packages:
```bash
npm test --workspaces
```

### 3. Run the Reference Node (Local)
```bash
cd packages/server
npx wrangler dev
```

### 4. Integration Demo
See a real agentic flow with automated payment negotiation:
```bash
npx ts-node scripts/demo.ts
```

## Documentation
- **[Formal Protocol Specification](PROTOCOL.md)**
- **[Implementer's Guide](docs/implementer-guide.html)** (Coming soon in v0.6.0)
- **[High-Contrast Documentation Suite](docs/index.html)**

## License
Open Core - Built at [adaptivefrontier.org](https://adaptivefrontier.org).
