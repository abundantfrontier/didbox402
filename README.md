# didbox402 Monorepo

**"A vending machine for privacy."**

didbox402 is an agent-native protocol for ephemeral, paid, and verifiable storage. This repository is organized as a modular monorepo using `npm workspaces`.

## Repository Structure

- **`packages/server`**: The reference didbox402 node implementation (Cloudflare Workers + R2 + D1).
- **`packages/sdk-core`**: The core HTTP protocol client for agents.
- **`packages/sdk-crypto`**: Cryptographic utilities for Ed25519 `did:key` identity and request signing.
- **`packages/sdk-payments`**: x402 payment negotiation and Lightning Network integration logic.

## Core Features (v0.2.0)
- **Cryptographic Sovereignty:** Real Ed25519 EdDSA signature verification with strict Request-Hash binding.
- **Automated Economics:** Full 402 Payment Required challenge-response handshake with automated SDK negotiation.
- **Private Inboxes:** Salted DID hashing for project-scoped privacy and isolation.
- **Stateless & Scalable:** Edge-native, hands-off scaling via Cloudflare primitives.

## Quick Start (v0.2.0)

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Conformance Tests
This verifies the cryptography and payment handshakes across all packages.
```bash
npm test
```

### 3. Run the Reference Node (Local)
```bash
cd packages/server
npx wrangler dev
```

### 4. Run the SDK Integration Demo
In a new terminal:
```bash
npx ts-node scripts/demo.ts
```

## Documentation
The complete technical specification is in **[PROTOCOL.md](PROTOCOL.md)**.
Extended architectural docs are available in **`docs/`**.

## License
Open Core - Built at [adaptivefrontier.org](https://adaptivefrontier.org).
