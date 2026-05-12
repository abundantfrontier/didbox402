/**
 * didbox402 Unified Payment Verification
 * Supports L402 (Lightning) and x402 (Web3/Stablecoin)
 */

export interface PaymentRequirement {
  type: 'L402' | 'x402';
  amount: number;
  currency: string;
  invoice?: string;
  address?: string;
  network?: string;
}

/**
 * Verifies if the request contains valid payment proof for any supported rail.
 */
export async function verifyAnyPayment(c: any, expectedAmount: number): Promise<boolean> {
  if (c.env.DEV_MODE === 'true') return true;

  const authHeader = c.req.header('Authorization');
  const x402Header = c.req.header('PAYMENT-SIGNATURE');

  // 1. Check L402 (Lightning)
  if (authHeader?.startsWith('L402 ')) {
    const proof = authHeader.substring(5); // macaroon:preimage
    const [macaroon, preimage] = proof.split(':');
    
    // TODO: Phase 2 - Real Macaroon + Preimage verification
    // Mock logic for v0.4.0 Phase 1
    return preimage === `preimage_${expectedAmount}`;
  }

  // 2. Check x402 (Web3)
  if (x402Header) {
    // TODO: Phase 3 - Real Web3 Signature/Settlement verification
    // Mock logic for v0.4.0 Phase 1
    return x402Header === `sig_${expectedAmount}`;
  }

  // Legacy fallback for v0.3.x clients (deprecated)
  const legacyPayment = c.req.header('X-Payment');
  if (legacyPayment) {
     return legacyPayment.startsWith(`preimage_${expectedAmount}_`);
  }

  return false;
}

/**
 * Issues a dual-rail 402 challenge.
 */
export function issueDualChallenge(c: any, amount: number) {
  // L402 Challenge
  const mockInvoice = `lnbc${amount}n1p...mock_invoice`;
  const mockMacaroon = `macaroon_v1_${amount}`;
  c.header('WWW-Authenticate', `L402 macaroon="${mockMacaroon}", invoice="${mockInvoice}"`);
  c.header('X-Amount', amount.toString());

  // x402 Challenge
  const x402Requirements = JSON.stringify({
    amount: (amount / 100000000), // Convert sats to pseudo-unit for example
    currency: 'USDC',
    network: 'base',
    address: '0x123...mock_wallet'
  });
  c.header('PAYMENT-REQUIRED', Buffer.from(x402Requirements).toString('base64'));

  return c.json({ 
    error: 'Payment Required', 
    amount_satoshis: amount,
    protocols: {
      L402: { invoice: mockInvoice, macaroon: mockMacaroon },
      x402: { requirements: JSON.parse(x402Requirements) }
    },
    message: `Payment required: ${amount} Satoshis. Supports L402 (Lightning) and x402 (Web3).`
  }, 402);
}
