# x402 Implementation Guide (USDC on Base)

**Version:** v0.7.0  
**Last Updated:** 2026-05-15

This guide provides practical, production-oriented guidance for implementing the **x402** (USDC on Base) payment rail in a didbox402 node.

## 1. Official USDC Contract Addresses

| Network       | Chain ID | USDC Contract Address                          | Explorer |
|---------------|----------|------------------------------------------------|----------|
| Base (Mainnet)    | 8453    | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | [basescan.org](https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) |
| Base Sepolia (Testnet) | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | [sepolia.basescan.org](https://sepolia.basescan.org/token/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |

**Recommendation:** Hardcode both addresses and select based on your `chain.id` or RPC URL.

## 2. Recommended RPC Providers

For reliable transaction receipt and log fetching:

- **Alchemy** (recommended for production) — Excellent uptime and debug APIs.
- **Infura**
- **QuickNode**
- **Public RPCs** (use only for development):
  - `https://mainnet.base.org`
  - `https://sepolia.base.org`

**Best Practice:** Use a paid provider with retry logic and rate-limit awareness. Avoid public endpoints in production.

## 3. Transaction Verification Flow (Recommended Pattern)

Use `viem` (as in the reference implementation) or `ethers.js`.

### Core Steps

1. Fetch the transaction receipt.
2. Verify `receipt.status === 'success'`.
3. Filter logs for the USDC `Transfer` event where:
   - `log.address` matches the USDC contract
   - `to` (indexed topic) matches your `USDC_WALLET_ADDRESS`
   - `value` (decoded) matches the expected amount (in 6-decimal USDC units)
4. Store the `txHash` in `used_payments` with appropriate expiry.

### Example (viem) — Recommended Pattern

```ts
import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({
  chain: base,
  transport: http(process.env.USDC_RPC_URL),
});

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

async function verifyUSDCPayment(
  txHash: `0x${string}`,
  expectedAmountUSDC: number, // e.g. 0.012345
  recipient: `0x${string}`
): Promise<boolean> {
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (!receipt || receipt.status !== 'success') return false;

  const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue;

    try {
      const decoded = decodeEventLog({
        abi: [transferEvent],
        data: log.data,
        topics: log.topics,
      });

      const toAddress = decoded.args.to.toLowerCase();
      const value = Number(decoded.args.value) / 1_000_000; // 6 decimals

      if (
        toAddress === recipient.toLowerCase() &&
        Math.abs(value - expectedAmountUSDC) < 0.000001
      ) {
        return true;
      }
    } catch {
      // Ignore unrelated logs
    }
  }
  return false;
}
```

## 4. Amount Handling & Precision

- USDC has **6 decimal places**.
- Always work in the smallest unit internally (`amount * 1_000_000` as bigint).
- When comparing, use a small epsilon (e.g., `0.000001`) to account for floating-point issues.

## 5. Replay Protection (`used_payments`)

Every successful x402 verification **MUST** result in an insert into the `used_payments` table:

```sql
INSERT INTO used_payments (payment_id, rail, amount, used_at, expires_at)
VALUES (?, 'x402', ?, unixepoch(), ?);
```

**Expiry recommendation:**
- Set `expires_at` to the lease end time + a grace period (e.g., 48 hours).
- Run periodic cleanup (same as the janitor process).

## 6. Confirmation Requirements

| Environment | Recommended Confirmations |
|-------------|---------------------------|
| Development / Testing | 1 |
| Production            | 1–2 (Base finality is fast) |

Base has very fast finality. Requiring more than 2 confirmations is rarely necessary.

## 7. Common Gotchas & Best Practices

- **Case sensitivity**: Always normalize addresses to lowercase for comparison.
- **Amount mismatch**: The amount in the challenge must exactly match the on-chain `value` (after dividing by 1e6).
- **Multiple transfers**: A transaction can contain multiple USDC transfers — verify the specific one to your wallet.
- **Failed transactions**: Always check `receipt.status === 'success'`.
- **RPC reliability**: Implement retries with exponential backoff for `getTransactionReceipt`.
- **Testnet vs Mainnet**: Use separate environment variables and contract addresses.
- **Gas & Fees**: The payer is responsible for Base gas fees. Your node only cares about the USDC `Transfer` event.

## 8. Environment Variables (Recommended)

```toml
USDC_RPC_URL = "https://base-mainnet.g.alchemy.com/v2/..."
USDC_WALLET_ADDRESS = "0xYourReceivingAddress"
USDC_CONTRACT_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"  # optional override
```

## 9. Testing Recommendations

- Use Base Sepolia for all development.
- Maintain a small set of test USDC on Sepolia.
- Write unit tests that mock `viem` responses for both success and failure cases (wrong amount, wrong recipient, failed tx, etc.).

---

**References**
- Reference implementation: `packages/server/src/lib/payments/web3.ts`
- PROTOCOL.md §4.3 – x402 Settlement Flow
- didbox402 OpenAPI spec

This guide will be expanded as more production operators share their experiences. Contributions welcome.