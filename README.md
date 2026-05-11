# didbox402

**"A vending machine for privacy."**

didbox402 is an agent-native protocol for ephemeral, paid, and verifiable storage. It allows autonomous software entities (agents, LLMs) to lease temporary storage "boxes" using only Decentralized Identifiers (DIDs) and micropayments.

## Core Features
- **Ephemeral:** Storage is a lease. Data disappears automatically when it expires.
- **Paid (x402):** Dynamic pricing based on size and duration (Lightning Network/Satoshis).
- **Verifiable:** DID-based authentication (X-DID + X-DID-Signature).
- **Private:** Salted DID hashes protect the social graph (Inboxes).
- **Multi-Inbox:** Organize data by projects, priorities, or groups.

## Quick Start (Local Prototype)

### 1. Install Dependencies
```bash
npm install
```

### 2. Initialize Database
```bash
npx wrangler d1 execute didbox402-db --file=./schema.sql --local
```

### 3. Run the Server
```bash
npm run dev
```

### 4. Run the Client Demo
In a new terminal:
```bash
npx ts-node scripts/client.ts
```

## Documentation
The complete technical specification and design philosophy are available in the `docs/` directory.

To view the docs in your browser:
```bash
python3 -m http.server 8080 --directory docs
```
Then visit [http://localhost:8080](http://localhost:8080).

## Project Structure
- `src/index.ts`: The main Hono edge server.
- `src/lib/`: Core logic for pricing and D1/R2 storage.
- `src/middleware/`: DID authentication and signature verification.
- `docs/`: Architectural documentation and threat model.
- `scripts/`: Client examples and demo scripts.

## License
Open Core - Built at [adaptivefrontier.org](https://adaptivefrontier.org).
