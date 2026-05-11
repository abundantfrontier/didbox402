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
    
    const signature = await this.config.signRequest(`${method}${path}${body}`);

    const headers = new Headers(options.headers);
    headers.set('X-DID', this.config.did);
    headers.set('X-DID-Signature', signature);
    if (body) headers.set('Content-Type', 'application/json');

    const res = await fetch(`${this.config.baseUrl}${path}`, { ...options, headers });
    
    // Automated 402 Negotiation
    if (res.status === 402 && this.config.autoPay) {
      const data: any = await res.json();
      const amount = data.amount_satoshis;
      const invoice = res.headers.get('X-Invoice') || data.invoice;
      
      const { preimage } = await negotiatePayment(amount, invoice);
      
      // Retry with payment header
      const retryHeaders = new Headers(headers);
      retryHeaders.set('X-Payment', preimage);
      
      return fetch(`${this.config.baseUrl}${path}`, { ...options, headers: retryHeaders });
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
