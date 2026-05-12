import { sha256 } from '@noble/hashes/sha2.js';

export interface LightningInvoice {
  paymentHash: string;
  bolt11: string;
}

export interface LightningProvider {
  createInvoice(amountSats: number, description: string): Promise<LightningInvoice>;
  verifyPayment(paymentHash: string): Promise<boolean>;
}

/**
 * Mock Lightning Provider for testing and Dev Mode.
 */
export class MockLightningProvider implements LightningProvider {
  async createInvoice(amountSats: number, description: string): Promise<LightningInvoice> {
    // Generate a random payment hash
    const preimage = crypto.getRandomValues(new Uint8Array(32));
    const paymentHash = Buffer.from(sha256(preimage)).toString('hex');
    const bolt11 = `lnbc${amountSats}n1p...mock_${paymentHash}`;
    
    return { paymentHash, bolt11 };
  }

  async verifyPayment(paymentHash: string): Promise<boolean> {
    // In mock mode, we assume payment is verified if the client provides a preimage
    // that matches the hash. This logic is handled in the verification function.
    return true;
  }
}

/**
 * Alby API Provider
 * For users who want a cloud-hosted Lightning wallet.
 */
export class AlbyProvider implements LightningProvider {
  constructor(private apiKey: string) {}

  async createInvoice(amountSats: number, description: string): Promise<LightningInvoice> {
    // TODO: Implement Alby API call
    // https://api.getalby.com/invoices
    throw new Error('AlbyProvider not yet implemented');
  }

  async verifyPayment(paymentHash: string): Promise<boolean> {
    // TODO: Implement Alby API check
    throw new Error('AlbyProvider not yet implemented');
  }
}
