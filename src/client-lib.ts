export interface DidBoxClientConfig {
  baseUrl: string;
  did: string;
  signRequest: (data: string) => Promise<string>;
}

export class DidBoxClient {
  constructor(private config: DidBoxClientConfig) {}

  private async request(path: string, options: RequestInit = {}) {
    const method = options.method || 'GET';
    const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : '';
    
    // In a real implementation, the signature would cover Method + Path + Body Hash
    const signature = await this.config.signRequest(`${method}${path}${body}`);

    const headers = new Headers(options.headers);
    headers.set('X-DID', this.config.did);
    headers.set('X-DID-Signature', signature);
    if (body) headers.set('Content-Type', 'application/json');

    const res = await fetch(`${this.config.baseUrl}${path}`, { ...options, headers });
    
    if (res.status === 402) {
      const data: any = await res.json();
      throw new Error(`Payment Required: ${data.amount_satoshis} Satoshis. Invoice: ${res.headers.get('X-Invoice')}`);
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

    return res.json();
  }

  async getInbox(alias: string = 'default') {
    const res = await this.request(`/inbox/${alias}`);
    return res.json();
  }

  async retrieve(id: string, inboxAlias: string = 'default') {
    const res = await this.request(`/retrieve/${id}`, {
      headers: { 'X-Inbox-Alias': inboxAlias }
    });
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
    return res.json();
  }
}
