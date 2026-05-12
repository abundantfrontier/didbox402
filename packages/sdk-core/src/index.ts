import { negotiatePayment } from '@didbox/sdk-payments';

export interface DidBoxClientConfig {
  baseUrl: string;
  did: string;
  signRequest: (data: string) => Promise<string>;
  /**
   * Automatically handle 402 challenges by calling negotiatePayment.
   * Defaults to false.
   */
  autoPay?: boolean;
}

export class DidBoxError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'DidBoxError';
  }
}

export class DidBoxPaymentRequiredError extends DidBoxError {
  constructor(public amount: number, public challenge: any, message: string) {
    super(402, message, challenge);
    this.name = 'DidBoxPaymentRequiredError';
  }
}

export class DidBoxClient {
  constructor(private config: DidBoxClientConfig) {}

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const method = options.method || 'GET';
    const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : '';
    const timestamp = Date.now();
    
    const signature = await this.config.signRequest(`${timestamp}${method}${path}${body}`);

    const headers = new Headers(options.headers);
    headers.set('X-DID', this.config.did);
    headers.set('X-DID-Signature', signature);
    headers.set('X-DID-Timestamp', timestamp.toString());
    if (body) headers.set('Content-Type', 'application/json');

    let res = await fetch(`${this.config.baseUrl}${path}`, { ...options, headers });
    
    // Automated 402 Negotiation (Optional)
    if (res.status === 402) {
      const l402Challenge = res.headers.get('WWW-Authenticate');
      const x402Challenge = res.headers.get('PAYMENT-REQUIRED');
      const data: any = await res.json();
      
      const challengeObj = {
        invoice: l402Challenge?.match(/invoice="([^"]+)"/)?.[1],
        macaroon: l402Challenge?.match(/macaroon="([^"]+)"/)?.[1],
        requirements: x402Challenge ? JSON.parse(Buffer.from(x402Challenge, 'base64').toString()) : undefined,
        amount: data.amount_satoshis || parseInt(res.headers.get('X-Amount') || '0')
      };

      if (this.config.autoPay) {
         const { preimage, signature: web3Sig } = await negotiatePayment(challengeObj.amount, challengeObj);
         
         const retryHeaders = new Headers(headers);
         if (preimage) {
            retryHeaders.set('Authorization', `L402 ${challengeObj.macaroon}:${preimage}`);
         } else if (web3Sig) {
            retryHeaders.set('PAYMENT-SIGNATURE', web3Sig);
         }
         
         res = await fetch(`${this.config.baseUrl}${path}`, { ...options, headers: retryHeaders });
      } else {
         throw new DidBoxPaymentRequiredError(challengeObj.amount, challengeObj, 'Payment Required');
      }
    }

    if (!res.ok) {
      throw new DidBoxError(res.status, `Request failed: ${res.status} ${await res.text()}`);
    }

    return res;
  }

  async store(ciphertext: string, durationHours: number, options: { recipientDid?: string, inboxAlias?: string, payment?: string } = {}) {
    const headers: any = {};
    if (options.payment) headers['X-Payment'] = options.payment;

    const res = await this.request('/store', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ciphertext,
        durationHours,
        recipientDid: options.recipientDid,
        inboxAlias: options.inboxAlias
      })
    });

    if (!res.ok) throw new Error(`Store failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async getInbox(alias: string = 'default') {
    const res = await this.request(`/inbox/${alias}`);
    if (!res.ok) throw new Error(`Inbox failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async retrieve(id: string, inboxAlias: string = 'default') {
    const res = await this.request(`/retrieve/${id}`, {
      headers: { 'X-Inbox-Alias': inboxAlias }
    });
    if (!res.ok) throw new Error(`Retrieve failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async extend(id: string, additionalHours: number, payment?: string) {
    const headers: any = {};
    if (payment) headers['X-Payment'] = payment;

    const res = await this.request(`/extend/${id}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ additionalHours })
    });
    if (!res.ok) throw new Error(`Extend failed: ${res.status} ${await res.text()}`);
    return res.json();
  }
}
