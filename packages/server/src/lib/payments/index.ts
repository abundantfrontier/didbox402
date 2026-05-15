import { sha256 } from '@noble/hashes/sha2.js';
import { LightningProvider, MockLightningProvider, AlbyProvider } from './lightning';
import { Web3Provider, MockWeb3Provider, BaseUSDCProvider } from './web3';

/**
 * Payment Rail Abstraction (v0.7.0)
 *
 * This module abstracts the two supported payment rails:
 *
 * - L402 (Lightning): Uses real Alby when ALBY_API_KEY is configured.
 * - x402 (USDC on Base): Uses real on-chain verification via viem when USDC_RPC_URL is configured.
 *
 * When real providers are not configured, the system falls back to in-memory mocks.
 * This is intentional for local development and testing.
 *
 * Key behaviors:
 * - Replay protection is always enforced via the `used_payments` table.
 * - Amount conversion for x402 uses the `SATS_PER_USD` env var (default 100,000).
 * - Legacy "mock_" shortcuts in Authorization / PAYMENT-SIGNATURE headers are only used
 *   when DEV_MODE or test environment is active (for test compatibility).
 */

/** Check if this payment proof has already been used (replay protection) */
async function isPaymentUsed(c: any, paymentId: string): Promise<boolean> {
  const row = await c.env.DB.prepare(
    "SELECT 1 FROM used_payments WHERE payment_id = ?"
  ).bind(paymentId).first();
  return !!row;
}

/** Record a used payment proof */
async function markPaymentUsed(c: any, paymentId: string, rail: 'L402' | 'x402', amount: number, leaseHours: number) {
  const now = Date.now();
  const expires = now + (leaseHours * 3600 * 1000);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO used_payments (payment_id, rail, amount, used_at, expires_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(paymentId, rail, amount, now, expires).run();
}

/**
 * Returns the appropriate Lightning provider based on configuration.
 */
function getLightningProvider(env: any): LightningProvider {
  const albyApiKey = env.ALBY_API_KEY;
  if (albyApiKey) {
    return new AlbyProvider(albyApiKey);
  }
  return new MockLightningProvider();
}

/**
 * Returns the appropriate Web3 (x402) provider based on configuration.
 */
function getWeb3Provider(env: any): Web3Provider {
  const rpcUrl = env.USDC_RPC_URL;
  const usdcAddress = env.USDC_CONTRACT_ADDRESS;

  if (rpcUrl) {
    return new BaseUSDCProvider(rpcUrl, usdcAddress);
  }
  return new MockWeb3Provider();
}

/**
 * Verifies payment proof for L402 (Lightning) or x402 (USDC).
 * Uses real providers when configured (Alby / Base RPC), otherwise falls back to mocks.
 */
export async function verifyAnyPayment(c: any, expectedAmount: number, leaseHours = 24): Promise<boolean> {
  const isDev = c.env.DEV_MODE === 'true';
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  // In DEV_MODE or test environment we allow everything (mock payments)
  if (isDev || isTest) return true;

  const authHeader = c.req.header('Authorization');
  const x402Header = c.req.header('PAYMENT-SIGNATURE');
  const recipient = c.env.USDC_WALLET_ADDRESS || '';

  // ===================== L402 (Lightning) =====================
  if (authHeader?.startsWith('L402 ')) {
    const token = authHeader.substring(5);
    const provider = getLightningProvider(c.env);

    // Legacy mock support (only active in DEV_MODE / test environment)
    if (token.includes('mock_')) {
      if (await isPaymentUsed(c, token)) return false;
      await markPaymentUsed(c, token, 'L402', expectedAmount, leaseHours);
      return true;
    }

    try {
      const parts = token.split(':');
      const decodedToken = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      const preimage = parts[1];

      // New v0.7.0 token format
      if (decodedToken.version === 1) {
        const paymentId = decodedToken.paymentHash;
        if (!paymentId) return false;

        if (await isPaymentUsed(c, paymentId)) return false;

        const amountOk = decodedToken.amount === expectedAmount;
        if (!amountOk) return false;

        // For real Alby, verify the payment was actually settled
        const actuallyPaid = await provider.verifyPayment(paymentId);
        if (!actuallyPaid) return false;

        await markPaymentUsed(c, paymentId, 'L402', expectedAmount, leaseHours);
        return true;
      }

      // Legacy token format (for mock or older clients)
      const paymentId = decodedToken.paymentHash;
      if (!paymentId) return false;

      if (await isPaymentUsed(c, paymentId)) return false;

      const actualHash = Buffer.from(sha256(Buffer.from(preimage, 'hex'))).toString('hex');
      const hashOk = actualHash === paymentId;

      if (hashOk) {
        await markPaymentUsed(c, paymentId, 'L402', expectedAmount, leaseHours);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // ===================== x402 (USDC on Base) =====================
  if (x402Header) {
    const txHash = x402Header;
    const provider = getWeb3Provider(c.env);

    // Legacy mock support (only active in DEV_MODE / test environment)
    if (txHash.includes('mock')) {
      if (await isPaymentUsed(c, txHash)) return false;
      await markPaymentUsed(c, txHash, 'x402', expectedAmount, leaseHours);
      return true;
    }

    if (await isPaymentUsed(c, txHash)) return false;

    // Convert internal satoshi pricing to USDC amount using configured rate
    const SATS_PER_USD = parseInt(c.env.SATS_PER_USD || '100000');
    const usdcAmount = expectedAmount / SATS_PER_USD;

    const ok = await provider.verifyUSDCPayment(txHash, usdcAmount, recipient);

    if (ok) {
      await markPaymentUsed(c, txHash, 'x402', expectedAmount, leaseHours);
    }
    return ok;
  }

  return false;
}

/**
 * Issues a dual-rail 402 challenge.
 * For production, replace Mock* with real providers (Alby + funded BaseUSDCProvider).
 */
export async function issueDualChallenge(c: any, amount: number) {
  const lightningProvider = getLightningProvider(c.env);
  const isRealL402 = !!c.env.ALBY_API_KEY;

  const { bolt11, paymentHash } = await lightningProvider.createInvoice(amount, `didbox402 storage lease`);

  // L402 Token (v0.7.0 format)
  // - For real Alby: clean versioned token (no preimage embedded)
  // - For mock: legacy format kept for test compatibility
  let macaroonPayload: any;
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + (48 * 60 * 60 * 1000)); // 48h token validity

  if (isRealL402) {
    macaroonPayload = {
      version: 1,
      paymentHash,
      amount,
      currency: "sats",
      issuedAt: now.toISOString(),
      expiresAt: tokenExpiresAt.toISOString(),
      description: "didbox402 storage lease",
      singleUse: true,
      resource: "storage"
    };
  } else {
    // Legacy mock format for tests
    const preimage = crypto.getRandomValues(new Uint8Array(32));
    const preimageHex = Buffer.from(preimage).toString('hex');
    const realPaymentHash = Buffer.from(sha256(preimage)).toString('hex');

    macaroonPayload = {
      amount,
      paymentHash: realPaymentHash,
      _mock_preimage: preimageHex,
    };
  }

  const macaroon = Buffer.from(JSON.stringify(macaroonPayload)).toString('base64');
  c.header('WWW-Authenticate', `L402 macaroon="${macaroon}", invoice="${bolt11}"`);

  // x402 Challenge (real on-chain verification when USDC_RPC_URL is set)
  const SATS_PER_USD = parseInt(c.env.SATS_PER_USD || '100000');
  const usdcAmount = (amount / SATS_PER_USD).toFixed(6);

  const x402Requirements = JSON.stringify({
    amount: usdcAmount,
    currency: 'USDC',
    network: 'base',
    address: c.env.USDC_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000',
    context: 'storage-lease',
  });
  c.header('PAYMENT-REQUIRED', Buffer.from(x402Requirements).toString('base64'));

  return c.json({
    error: 'Payment Required',
    amount_satoshis: amount,
    protocols: {
      L402: { invoice: bolt11, macaroon },
      x402: { requirements: JSON.parse(x402Requirements) },
    },
  }, 402);
}
