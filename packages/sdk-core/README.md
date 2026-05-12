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

## Basic Usage

```typescript
import { DidBoxClient } from '@didbox/sdk-core';
import { signRequest } from '@didbox/sdk-crypto';

const client = new DidBoxClient({
  baseUrl: 'https://node.didbox.com',
  did: 'did:key:z6Mk...',
  signRequest: (data) => signRequest(myPrivKey, 'POST', '/store', data),
  autoPay: true // Optional: Set to true for automated 402 handling
});

// Store ciphertext for 24 hours
const { storageId } = await client.store(encryptedData, 24);
```

## Manual 402 Handling
If `autoPay` is false (default), the client will throw a `DidBoxPaymentRequiredError`.

```typescript
try {
  await client.store(data, 1);
} catch (err) {
  if (err instanceof DidBoxPaymentRequiredError) {
    console.log(`Please pay ${err.amount} sats to: ${err.challenge.invoice}`);
  }
}
```
