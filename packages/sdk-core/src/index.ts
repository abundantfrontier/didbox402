import { negotiatePayment } from '@didbox/sdk-payments';

export interface DidBoxClientConfig {
  baseUrl: string;
  did: string;
  signRequest: (data: string) => Promise<string>;
  autoPay?: boolean;
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

    const res = await fetch(`${this.config.baseUrl}${path}`, { ...options, headers });
    
    // Automated 402 Negotiation (L402 and x402)
    if (res.status === 402 && this.config.autoPay) {
      const l402Challenge = res.headers.get('WWW-Authenticate');
      const x402Challenge = res.headers.get('PAYMENT-REQUIRED');
      
      if (l402Challenge?.startsWith('L402 ')) {
         // L402 Flow
         const parts = l402Challenge.substring(5).split(',').reduce((acc: any, part) => {
           const [key, value] = part.trim().split('=');
           acc[key] = value.replace(/"/g, '');
           return acc;
         }, {});
         
         const amount = parseInt(res.headers.get('X-Amount') || '0');
         
         // For the v0.4.0 Hardened Mock: Extract the mock preimage from the macaroon
         const decodedMacaroon = JSON.parse(Buffer.from(parts.macaroon, 'base64').toString());
         const preimage = decodedMacaroon._mock_preimage;
         
         await negotiatePayment(amount, parts.invoice);
         
         const retryHeaders = new Headers(headers);
         retryHeaders.set('Authorization', `L402 ${parts.macaroon}:${preimage}`);
         return fetch(`${this.config.baseUrl}${path}`, { ...options, headers: retryHeaders });
      } else if (x402Challenge) {
         // x402 Flow
         const requirements = JSON.parse(Buffer.from(x402Challenge, 'base64').toString());
         await negotiatePayment(requirements.amount, 'x402');
         const retryHeaders = new Headers(headers);
         retryHeaders.set('PAYMENT-SIGNATURE', `sig_${requirements.amount}`);
         return fetch(`${this.config.baseUrl}${path}`, { ...options, headers: retryHeaders });
      }
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
