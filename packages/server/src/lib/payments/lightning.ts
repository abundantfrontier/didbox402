import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '../bytes';

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
    const paymentHash = bytesToHex(sha256(preimage));
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
 * Alby API Provider (Real Lightning via Alby)
 * https://api.getalby.com
 *
 * This provider talks to Alby's hosted Lightning infrastructure.
 * Requires an Alby API key with invoice creation + read permissions.
 */
export class AlbyProvider implements LightningProvider {
  private baseUrl = 'https://api.getalby.com';

  constructor(private apiKey: string) {
    if (!apiKey) {
      throw new Error('AlbyProvider requires an API key');
    }
  }

  async createInvoice(amountSats: number, description: string): Promise<LightningInvoice> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/invoices`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountSats,
          description: description || 'didbox402 storage lease',
        }),
      });
    } catch (err) {
      throw new AlbyError('NETWORK_ERROR', 'Failed to connect to Alby API', 0, err);
    }

    if (!res.ok) {
      const errorText = await res.text();
      const albyError = this.classifyAlbyError(res.status, errorText);
      throw new AlbyError(albyError.code, albyError.message, res.status, errorText);
    }

    const data: any = await res.json();

    if (!data.payment_hash || !data.payment_request) {
      throw new AlbyError(
        'INVALID_RESPONSE',
        'Alby response missing payment_hash or payment_request',
        res.status,
        data
      );
    }

    return {
      paymentHash: data.payment_hash,
      bolt11: data.payment_request,
    };
  }

  async verifyPayment(paymentHash: string): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/invoices/${paymentHash}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
    } catch (err) {
      throw new AlbyError('NETWORK_ERROR', 'Failed to connect to Alby API', 0, err);
    }

    if (res.status === 404) {
      // Invoice does not exist
      return false;
    }

    if (!res.ok) {
      const errorText = await res.text();
      const albyError = this.classifyAlbyError(res.status, errorText);
      throw new AlbyError(albyError.code, albyError.message, res.status, errorText);
    }

    const data: any = await res.json();

    return data.settled === true;
  }

  /**
   * Classify common Alby API error responses for better debugging.
   */
  private classifyAlbyError(status: number, body: string): { code: string; message: string } {
    if (status === 401 || status === 403) {
      return {
        code: 'AUTH_ERROR',
        message: 'Invalid or missing Alby API key',
      };
    }

    if (status === 429) {
      return {
        code: 'RATE_LIMITED',
        message: 'Alby API rate limit exceeded',
      };
    }

    if (status >= 500) {
      return {
        code: 'ALBY_SERVER_ERROR',
        message: `Alby server error (${status})`,
      };
    }

    return {
      code: 'API_ERROR',
      message: `Alby API error (${status}): ${body}`,
    };
  }
}

/**
 * Structured error for Alby-related failures.
 */
export class AlbyError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'AlbyError';
  }
}
