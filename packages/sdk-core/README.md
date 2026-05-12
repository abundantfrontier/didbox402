# @didbox/sdk-core

The core TypeScript client library for interacting with the **didbox402** protocol.

## Features
- **Stateless Auth:** Automatically handles DID signing and temporal binding headers.
- **Lease Management:** Methods for `store`, `retrieve`, `inbox`, and `extend`.
- **Optional Auto-Pay:** Can autonomously negotiate 402 challenges via `@didbox/sdk-payments`.

## Installation
```bash
npm install @didbox/sdk-core @didbox/sdk-crypto @didbox/sdk-payments
```

## Basic Usage (Autonomous Mode)
Autonomous mode uses an "Intelligent Interceptor" to handle 402 challenges automatically.

```typescript
import { DidBoxClient } from '@didbox/sdk-core';

const client = new DidBoxClient({
  baseUrl: 'https://node.didbox.com',
  did: 'did:key:z6Mk...',
  signRequest: async (data) => { /* sign with your private key */ },
  autoPay: true 
});

// The client will catch 402, pay the invoice via the connected wallet, and return the storageId
const { storageId } = await client.store(encryptedData, 24);
```

## Manual Mode (Full Control)
For commercial providers who want to wrap payment logic in their own UI or logic, manual mode is recommended.

```typescript
const client = new DidBoxClient({
  baseUrl: 'https://node.didbox.com',
  did: 'did:key:z6Mk...',
  signRequest: async (data) => { ... },
  autoPay: false // Explicitly disable auto-negotiation
});

try {
  await client.store(data, 1);
} catch (err) {
  if (err instanceof DidBoxPaymentRequiredError) {
    // Access the raw challenge headers
    const { invoice, requirements, amount } = err.challenge;
    
    console.log(`Payment required: ${amount} sats`);
    
    // Perform custom business logic (e.g., check user balance, show QR code)
    const { preimage } = await myCustomPaymentHandler(invoice);
    
    // Retry the request with the proof
    const res = await client.store(data, 1, { payment: preimage });
  }
}
```

## Decision Guide: Autonomous vs. Manual
- **Use Autonomous (`autoPay: true`)** when building simple agents that already have a connected wallet (e.g., Alby in the browser) and you want minimal boilerplate.
- **Use Manual (`autoPay: false`)** when building commercial applications, server-side agents, or systems where you need to track payments, display custom UI, or implement advanced budgeting.
