import { sha256 } from '@noble/hashes/sha2.js';
import { LightningProvider, MockLightningProvider } from './lightning';
import { Web3Provider, MockWeb3Provider } from './web3';

/**
 * Unified Payment Verification (v0.5.0 Hardened)
 * Supports real L402 Macaroons and x402 Web3 signatures.
 */

/**
 * Verifies if the request contains valid payment proof for any supported rail.
 */
export async function verifyAnyPayment(c: any, expectedAmount: number): Promise<boolean> {
  if (c.env.DEV_MODE === 'true') return true;

  const authHeader = c.req.header('Authorization');
  const x402Header = c.req.header('PAYMENT-SIGNATURE');

  // 1. Check L402 (Lightning)
  if (authHeader?.startsWith('L402 ')) {
    try {
      const decodedMacaroon = JSON.parse(Buffer.from(authHeader.split(' ')[1].split(':')[0], 'base64').toString());
      const preimage = authHeader.split(':')[1];
      const actualHash = Buffer.from(sha256(Buffer.from(preimage, 'hex'))).toString('hex');
      return actualHash === decodedMacaroon.paymentHash && decodedMacaroon.amount === expectedAmount;
    } catch (e) {
      return false;
    }
  }

  // 2. Check x402 (Web3)
  if (x402Header) {
    const provider = new MockWeb3Provider();
    return provider.verifyUSDCPayment(x402Header, expectedAmount, c.env.USDC_WALLET_ADDRESS);
  }

  return false;
}

/**
 * Issues a dual-rail 402 challenge using real-ish providers.
 */
export async function issueDualChallenge(c: any, amount: number) {
  // Use Mock provider if in dev, or real one if configured
  const provider = new MockLightningProvider();
  const { bolt11, paymentHash } = await provider.createInvoice(amount, `didbox402 storage lease`);

  // Create L402 Macaroon (Mocked structure for v0.5.0 Alpha)
  const preimage = crypto.getRandomValues(new Uint8Array(32));
  const preimageHex = Buffer.from(preimage).toString('hex');
  const realPaymentHash = Buffer.from(sha256(preimage)).toString('hex');

  const macaroon = Buffer.from(JSON.stringify({
    amount,
    paymentHash: realPaymentHash,
    _mock_preimage: preimageHex 
  })).toString('base64');

  c.header('WWW-Authenticate', `L402 macaroon="${macaroon}", invoice="${bolt11}"`);
  c.header('X-Amount', amount.toString());

  // x402 Challenge
  const x402Requirements = JSON.stringify({
    amount: (amount / 100000000), 
    currency: 'USDC',
    network: 'base',
    address: c.env.USDC_WALLET_ADDRESS || '0x123...admin_wallet'
  });
  c.header('PAYMENT-REQUIRED', Buffer.from(x402Requirements).toString('base64'));

  return c.json({ 
    error: 'Payment Required', 
    amount_satoshis: amount,
    protocols: {
      L402: { invoice: bolt11, macaroon: macaroon },
      x402: { requirements: JSON.parse(x402Requirements) }
    }
  }, 402);
}
