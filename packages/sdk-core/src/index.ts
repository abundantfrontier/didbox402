import { negotiatePayment } from '@didbox/sdk-payments';

export interface DidBoxDiscovery {
  protocol_version?: string;
  billing_mode?: 'micropayment' | 'entitlement';
  supported_rails?: string[];
  entitlement?: {
    methods?: string[];
    header?: string;
    key_format?: string;
  };
}

export interface DidBoxClientConfig {
  baseUrl: string;
  did: string;
  /** Required when connecting to nodes with billing_mode: entitlement */
  entitlementKey?: string;
  /**
   * User-provided signing function.
   * Must produce a hex Ed25519 signature over the exact binding:
   * SHA256( UTF8(ts) + method + pathname + hex(SHA256(body)) )
   *
   * Recommended: use `signRequest` from '@didbox/sdk-crypto'
   */
  signRequest: (timestamp: number, method: string, path: string, body: string) => Promise<string>;
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

export interface MigrateOptions {
  destinationUrl: string;
  newDurationHours: number;
  inboxAlias?: string;
  /** Entitlement key for the destination when it uses billing_mode: entitlement */
  destinationEntitlementKey?: string;
}

export interface MigrateResult {
  newStorageId: string;
}

export class DidBoxClient {
  private discoveryCache: DidBoxDiscovery | null = null;

  constructor(private config: DidBoxClientConfig) {}

  /**
   * Create a client configured for a specific node URL.
   */
  static forNode(
    nodeUrl: string,
    config: Omit<DidBoxClientConfig, 'baseUrl'>
  ): DidBoxClient {
    return new DidBoxClient({
      ...config,
      baseUrl: nodeUrl.replace(/\/$/, ''),
    });
  }

  clearDiscoveryCache(): void {
    this.discoveryCache = null;
  }

  async getDiscovery(): Promise<DidBoxDiscovery> {
    if (!this.discoveryCache) {
      const res = await fetch(`${this.config.baseUrl}/.well-known/didbox-configuration`);
      if (!res.ok) {
        throw new DidBoxError(res.status, `Discovery failed: ${res.status}`);
      }
      this.discoveryCache = await res.json();
    }
    return this.discoveryCache!;
  }

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const method = options.method || 'GET';
    const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : '';
    const timestamp = Date.now();
    const discovery = await this.getDiscovery();

    const signature = await this.config.signRequest(timestamp, method, path, body);

    const headers = new Headers(options.headers);
    headers.set('X-DID', this.config.did);
    headers.set('X-DID-Signature', signature);
    headers.set('X-DID-Timestamp', timestamp.toString());
    if (body) headers.set('Content-Type', 'application/json');

    if (discovery.billing_mode === 'entitlement') {
      if (!this.config.entitlementKey) {
        throw new DidBoxError(403, 'Entitlement key required for this node');
      }
      const entitlementHeader = discovery.entitlement?.header || 'X-DIDBOX-Entitlement';
      headers.set(entitlementHeader, this.config.entitlementKey);
    }

    let res = await fetch(`${this.config.baseUrl}${path}`, { ...options, headers });

    if (res.status === 402 && discovery.billing_mode !== 'entitlement') {
      const l402Challenge = res.headers.get('WWW-Authenticate');
      const x402Challenge = res.headers.get('PAYMENT-REQUIRED');
      const data: any = await res.json();
      const supportedRails = discovery.supported_rails ?? ['L402', 'x402'];
      const hasL402 = supportedRails.includes('L402') && !!l402Challenge;
      const hasX402 = supportedRails.includes('x402') && !!x402Challenge;

      const challengeObj = {
        invoice: hasL402 ? l402Challenge?.match(/invoice="([^"]+)"/)?.[1] : undefined,
        macaroon: hasL402 ? l402Challenge?.match(/macaroon="([^"]+)"/)?.[1] : undefined,
        requirements: hasX402 && x402Challenge
          ? JSON.parse(Buffer.from(x402Challenge, 'base64').toString())
          : undefined,
        amount: data.amount_satoshis || parseInt(res.headers.get('X-Amount') || '0'),
      };

      if (this.config.autoPay) {
        if (!hasL402 && !hasX402) {
          throw new DidBoxError(402, 'Node returned 402 but no supported rail challenge was advertised');
        }
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
        inboxAlias: options.inboxAlias,
      }),
    });

    return res.json();
  }

  async getInbox(alias: string = 'default') {
    const res = await this.request(`/inbox/${alias}`);
    return res.json();
  }

  async retrieve(id: string, inboxAlias: string = 'default') {
    const res = await this.request(`/retrieve/${id}`, {
      headers: { 'X-Inbox-Alias': inboxAlias },
    });
    return res.json();
  }

  async extend(id: string, additionalHours: number, payment?: string) {
    const headers: any = {};
    if (payment) headers['X-Payment'] = payment;

    const res = await this.request(`/extend/${id}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ additionalHours }),
    });
    return res.json();
  }

  async delete(storageId: string) {
    const res = await this.request(`/store/${storageId}`, { method: 'DELETE' });
    if (res.status !== 204) {
      throw new DidBoxError(res.status, `Delete failed: ${res.status}`);
    }
  }

  /**
   * Client-orchestrated cross-node move: retrieve from this node, store on destination.
   * No server-side migration endpoints are involved.
   */
  async migrate(sourceStorageId: string, options: MigrateOptions): Promise<MigrateResult> {
    const { destinationUrl, newDurationHours, inboxAlias = 'default' } = options;

    const destinationClient = DidBoxClient.forNode(destinationUrl, {
      did: this.config.did,
      signRequest: this.config.signRequest,
      autoPay: this.config.autoPay,
      entitlementKey: options.destinationEntitlementKey,
    });

    const { ciphertext } = await this.retrieve(sourceStorageId, inboxAlias);
    const storeResult = await destinationClient.store(ciphertext, newDurationHours, {
      recipientDid: this.config.did,
      inboxAlias,
    });

    return { newStorageId: storeResult.storageId };
  }
}