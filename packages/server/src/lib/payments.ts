import { sha256 } from '@noble/hashes/sha2.js';

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
 * Hardened: Performs real SHA256 preimage verification for L402.
 */
export async function verifyAnyPayment(c: any, expectedAmount: number): Promise<boolean> {
  if (c.env.DEV_MODE === 'true') return true;

  const authHeader = c.req.header('Authorization');
  const x402Header = c.req.header('PAYMENT-SIGNATURE');

  // 1. Check L402 (Lightning)
  if (authHeader?.startsWith('L402 ')) {
    const proof = authHeader.substring(5); // macaroon:preimage
    const [macaroon, preimage] = proof.split(':');
    
    // In a real system, the server would lookup the macaroon's payment_hash in a DB.
    // For this reference implementation, we decode the macaroon to find the expected hash.
    try {
      const decoded = JSON.parse(Buffer.from(macaroon, 'base64').toString());
      
      // Verification:
      // a. Preimage must hash to paymentHash
      const actualHash = Buffer.from(sha256(Buffer.from(preimage, 'hex'))).toString('hex');
      if (actualHash !== decoded.paymentHash) return false;

      // b. Amount must match
      if (decoded.amount !== expectedAmount) return false;

      return true;
    } catch (e) {
      return false;
    }
  }

  // 2. Check x402 (Web3)
  if (x402Header) {
    // Mock logic for x402 signature verification
    return x402Header.startsWith('sig_') && x402Header.includes(expectedAmount.toString());
  }

  return false;
}

/**
 * Issues a dual-rail 402 challenge.
 */
export function issueDualChallenge(c: any, amount: number) {
  // Get Request Hash for informational binding
  const method = c.req.method;
  const path = new URL(c.req.url).pathname;
  const bodyText = c.get('bodyText') || '';
  const bodyHash = Buffer.from(sha256(new TextEncoder().encode(bodyText))).toString('hex');
  const requestContext = `${method}${path}${bodyHash}`;

  // L402 Challenge: Generate a random preimage/hash pair
  const preimage = crypto.getRandomValues(new Uint8Array(32));
  const paymentHash = Buffer.from(sha256(preimage)).toString('hex');
  const preimageHex = Buffer.from(preimage).toString('hex');

  const mockInvoice = `lnbc${amount}n1p...${paymentHash}`;
  // We encode the paymentHash and preimage (simulating the settlement) in the macaroon for the mock
  const mockMacaroon = Buffer.from(JSON.stringify({ 
    amount, 
    paymentHash,
    _mock_preimage: preimageHex // FOR DEMO/TEST ONLY: Real macaroons wouldn't have this
  })).toString('base64');

  c.header('WWW-Authenticate', `L402 macaroon="${mockMacaroon}", invoice="${mockInvoice}"`);
  c.header('X-Amount', amount.toString());

  // x402 Challenge
  const x402Requirements = JSON.stringify({
    amount: (amount / 100000000), 
    currency: 'USDC',
    network: 'base',
    address: c.env.USDC_WALLET_ADDRESS || '0x123...admin_wallet',
    context: requestContext
  });
  c.header('PAYMENT-REQUIRED', Buffer.from(x402Requirements).toString('base64'));

  return c.json({ 
    error: 'Payment Required', 
    amount_satoshis: amount,
    protocols: {
      L402: { invoice: mockInvoice, macaroon: mockMacaroon },
      x402: { requirements: JSON.parse(x402Requirements) }
    },
    message: `Payment required: ${amount} Satoshis. Tied to request: ${requestContext.substring(0, 16)}...`
  }, 402);
}
