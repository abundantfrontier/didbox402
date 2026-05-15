import { negotiatePayment } from '@didbox/sdk-payments';
import { verifyMigrationAuthorization, type MigrationAuthorization } from '@didbox/sdk-crypto';

export interface DidBoxClientConfig {
  baseUrl: string;
  did: string;
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

// === Migration-specific errors (v0.7.0+) ===

export class DidBoxVerificationError extends DidBoxError {
  constructor(message: string, public details?: any) {
    super(400, message, details);
    this.name = 'DidBoxVerificationError';
  }
}

export class DidBoxMigrationError extends DidBoxError {
  constructor(
    public stage: 'proof' | 'retrieve' | 'store' | 'unknown',
    message: string,
    public details?: any
  ) {
    super(500, message, details);
    this.name = 'DidBoxMigrationError';
  }
}

// Re-export MigrationAuthorization type for convenience
export type { MigrationAuthorization } from '@didbox/sdk-crypto';

// Migration errors are already exported via `export class` above.

export interface GetMigrationProofResult {
  authorization: MigrationAuthorization;
  verified: boolean;
  verificationError?: string;
}

export interface MigrateOptions {
  destinationUrl: string;
  newDurationHours: number;
  inboxAlias?: string;
}

export interface MigrateResult {
  newStorageId: string;
}

export class DidBoxClient {
  constructor(private config: DidBoxClientConfig) {}

  /**
   * Create a new DidBoxClient configured for a specific node.
   * Useful when you need to interact with a node other than your primary one
   * (e.g., getting a Migration Proof from a source node).
   */
  static forNode(
    nodeUrl: string,
    config: Omit<DidBoxClientConfig, 'baseUrl'>
  ): DidBoxClient {
    return new DidBoxClient({
      ...config,
      baseUrl: nodeUrl.replace(/\/$/, '') // remove trailing slash
    });
  }

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const method = options.method || 'GET';
    const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : '';
    const timestamp = Date.now();
    
    // Pass components to user-provided signer (which should use the correct double-hash per spec 3.2)
    const signature = await this.config.signRequest(timestamp, method, path, body);

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

  /**
   * Requests a Migration Proof (signed MigrationAuthorization) from this node.
   * This is the main entry point for Phase 1 of Sovereign Mobility.
   */
  async getMigrationProof(
    storageId: string,
    options: { verifySignature?: boolean } = {}
  ): Promise<GetMigrationProofResult> {
    const { verifySignature = true } = options;

    const res = await this.request(`/migrate/${storageId}/authorize`, {
      method: 'POST'
    });

    if (!res.ok) {
      const text = await res.text();
      throw new DidBoxError(res.status, `Failed to get migration proof: ${text}`);
    }

    const authorization: MigrationAuthorization = await res.json();

    if (!verifySignature) {
      return { authorization, verified: false };
    }

    // Fetch the node's identity from its own discovery document
    try {
      const discoveryRes = await fetch(`${this.config.baseUrl}/.well-known/didbox-configuration`);
      if (!discoveryRes.ok) {
        return {
          authorization,
          verified: false,
          verificationError: 'Failed to fetch node identity from source node'
        };
      }

      const discovery = await discoveryRes.json();
      const nodeIdentity = discovery.node_identity;

      if (!nodeIdentity?.did) {
        return {
          authorization,
          verified: false,
          verificationError: 'Source node does not publish a node_identity'
        };
      }

      // Extract public key from the did:key
      const { extractPublicKeyFromDid } = await import('@didbox/sdk-crypto');
      const nodePublicKey = extractPublicKeyFromDid(nodeIdentity.did);

      const verified = await verifyMigrationAuthorization(authorization, nodePublicKey);

      return {
        authorization,
        verified,
        verificationError: verified ? undefined : 'Signature verification failed'
      };
    } catch (err) {
      if (err instanceof DidBoxVerificationError) throw err;

      return {
        authorization,
        verified: false,
        verificationError: err instanceof Error ? err.message : 'Unknown verification error'
      };
    }
  }

  /**
   * Basic high-level migration helper (Phase 1).
   *
   * This is a convenience method that:
   *   1. Gets a Migration Proof from the current (source) node
   *   2. Retrieves the ciphertext
   *   3. Stores it on the destination node
   *
   * Note: In Phase 1, this does *not* present the Migration Proof to the
   * destination node. That capability is planned for a future phase.
   */
  async migrate(
    sourceStorageId: string,
    options: MigrateOptions
  ): Promise<MigrateResult> {
    const { destinationUrl, newDurationHours, inboxAlias = 'default' } = options;

    // Create a client for the destination node using the same identity
    const destinationClient = DidBoxClient.forNode(destinationUrl, {
      did: this.config.did,
      signRequest: this.config.signRequest,
      autoPay: this.config.autoPay,
    });

    try {
      // Step 1: Get Migration Proof from source (this client)
      const proofResult = await this.getMigrationProof(sourceStorageId);

      if (!proofResult.verified) {
        throw new DidBoxMigrationError(
          'proof',
          `Failed to obtain verified Migration Proof: ${proofResult.verificationError || 'Unknown error'}`,
          { verificationError: proofResult.verificationError }
        );
      }

      // Step 2: Retrieve the ciphertext from source
      const retrieveRes = await this.request(`/retrieve/${sourceStorageId}`, {
        headers: { 'X-Inbox-Alias': inboxAlias }
      });

      if (!retrieveRes.ok) {
        const text = await retrieveRes.text();
        throw new DidBoxMigrationError(
          'retrieve',
          `Failed to retrieve data from source: ${text}`,
          { status: retrieveRes.status, body: text }
        );
      }

      const { ciphertext } = await retrieveRes.json();

      // Step 3: Store on destination
      const storeRes = await destinationClient.request('/store', {
        method: 'POST',
        body: JSON.stringify({
          ciphertext,
          durationHours: newDurationHours,
          recipientDid: this.config.did,
          inboxAlias
        })
      });

      if (!storeRes.ok) {
        const text = await storeRes.text();
        throw new DidBoxMigrationError(
          'store',
          `Failed to store data on destination: ${text}`,
          { status: storeRes.status, body: text }
        );
      }

      const { storageId: newStorageId } = await storeRes.json();

      return { newStorageId };
    } catch (err) {
      if (err instanceof DidBoxMigrationError || err instanceof DidBoxVerificationError) {
        throw err;
      }
      throw new DidBoxMigrationError(
        'unknown',
        `Migration failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        { originalError: err }
      );
    }
  }
}
