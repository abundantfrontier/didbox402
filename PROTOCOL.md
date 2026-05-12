# didbox402 Protocol Specification (v0.5.0)

**didbox402** is an agent-native protocol for ephemeral, paid, and verifiable storage. v0.5.0 introduces **The Mainnet Bridge**, supporting real financial settlement via Lightning and Web3.

---

## 3. Economics (The Rail)

didbox402 v0.5.0 supports two standard production rails.

### 3.1 Supported Standards
- **L402 (Lightning Network):** Bitcoin-native satoshi micropayments using Macaroons.
- **x402 (Web3/Stablecoin):** USDC stablecoin settlement on Ethereum Layer 2s (Base).

### 3.2 The x402 Handshake (Discovery-Challenge-Settlement)
1. **Discovery:** Client sends a request without `Authorization` or `PAYMENT-SIGNATURE`.
2. **Challenge:** Server MUST respond with `402 Payment Required`.
   - **L402 Challenge:** `WWW-Authenticate: L402 macaroon="...", invoice="..."`.
   - **x402 Challenge:** `PAYMENT-REQUIRED: {Base64 requirements}`.
3. **Settlement:** The agent pays the invoice (Lightning) or sends the transfer (Web3).
4. **Fulfillment:** The agent retries the request with proof:
   - **L402:** `Authorization: L402 <macaroon>:<preimage>`.
   - **x402:** `PAYMENT-SIGNATURE: <transaction_hash_or_proof>`.

---

## 4. Node Configuration

Production node operators should configure the following environment variables:
- `LND_HOST / LND_MACAROON`: For L402 rail.
- `RPC_URL_BASE`: For x402 on Base.
- `USDC_WALLET_ADDRESS`: The destination for Web3 payments.

---
**Version:** 0.5.0  
**Status:** Mainnet Alpha
