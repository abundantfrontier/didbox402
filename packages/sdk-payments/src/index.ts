export interface PaymentProof {
  preimage?: string;
  signature?: string;
}

/**
 * Negotiates payment via the most appropriate wallet.
 * Supports WebLN for Lightning and EIP-1193 for Web3.
 */
export async function negotiatePayment(amount: number, challenge: any): Promise<PaymentProof> {
  console.log(`[SDK] Negotiating payment of ${amount} Satoshis...`);

  // 1. Check for WebLN (Lightning)
  if (challenge.invoice && typeof window !== 'undefined' && (window as any).webln) {
    try {
      const webln = (window as any).webln;
      await webln.enable();
      const result = await webln.sendPayment(challenge.invoice);
      return { preimage: result.preimage };
    } catch (e) {
      console.warn('[SDK] WebLN payment failed, falling back...');
    }
  }

  // 2. Check for EIP-1193 (Web3)
  if (challenge.requirements && typeof window !== 'undefined' && (window as any).ethereum) {
     try {
       // Mock for v0.5.0: In a real app, this would use ethers/viem to sign a permit or transfer
       console.log('[SDK] Requesting Web3 signature for x402...');
       return { signature: `sig_${amount}_mock` };
     } catch (e) {
       console.warn('[SDK] Web3 payment failed.');
     }
  }

  // Fallback for headless environments or manual payment
  if (process.env.DEV_MODE === 'true') {
     return { preimage: `preimage_${amount}_mock` };
  }

  throw new Error('No compatible wallet found for 402 challenge');
}
