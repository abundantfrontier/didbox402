import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DidBoxClient } from '../index';

describe('DidBoxClient', () => {
  const config = {
    baseUrl: 'http://test-node.local',
    did: 'did:key:z6Mktest',
    // New 4-arg signature per v0.6.2 / v0.7.0 spec
    signRequest: vi.fn().mockResolvedValue('test_signature'),
    autoPay: true
  };

  let client: DidBoxClient;

  function mockDiscovery(billingMode = 'micropayment') {
    return {
      status: 200,
      ok: true,
      json: async () => ({
        billing_mode: billingMode,
        supported_rails: billingMode === 'entitlement' ? [] : ['L402', 'x402'],
        entitlement: billingMode === 'entitlement'
          ? { header: 'X-DIDBOX-Entitlement', methods: ['api_key'] }
          : undefined,
      }),
    };
  }

  beforeEach(() => {
    client = new DidBoxClient(config);
    vi.clearAllMocks();
    // Global fetch mock
    global.fetch = vi.fn();
    // Enable dev mode for tests
    process.env.DEV_MODE = 'true';
  });

  it('automatically handles 402 challenge-response flow', async () => {
    const mockInvoice = 'lnbc100n1p...';
    const mockMacaroon = Buffer.from(JSON.stringify({ 
      amount: 100, 
      paymentHash: 'hash', 
      _mock_preimage: 'preimage_100_ok' 
    })).toString('base64');

    (global.fetch as any)
      .mockResolvedValueOnce(mockDiscovery())
      // 1. Store call returns 402
      .mockResolvedValueOnce({
        status: 402,
        ok: false,
        headers: new Headers({ 
          'WWW-Authenticate': `L402 macaroon="${mockMacaroon}", invoice="${mockInvoice}"`,
          'X-Amount': '100'
        }),
        json: async () => ({ amount_satoshis: 100 }),
        text: async () => 'Payment Required'
      })
      // 2. Second call (retry) returns 200
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => ({ storageId: 'box-123' })
      });

    const result = await client.store('test data', 1);

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result.storageId).toBe('box-123');
    
    // Verify retry had the Authorization header
    const secondCallHeaders = (global.fetch as any).mock.calls[2][1].headers;
    expect(secondCallHeaders.get('Authorization')).toContain('L402');
  });

  it('throws error if autoPay is false and 402 is received', async () => {
    client = new DidBoxClient({ ...config, autoPay: false });
    
    (global.fetch as any)
      .mockResolvedValueOnce(mockDiscovery())
      .mockResolvedValueOnce({
        status: 402,
        ok: false,
        headers: new Headers(),
        json: async () => ({ amount_satoshis: 100 }),
        text: async () => 'Payment Required'
      });

    await expect(client.store('test', 1)).rejects.toThrow('Payment Required');
  });

  it('correctly includes X-DID-Timestamp in every request', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(mockDiscovery())
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ items: [] })
      });

    await client.getInbox();
    
    const callHeaders = (global.fetch as any).mock.calls[1][1].headers;
    expect(callHeaders.get('X-DID-Timestamp')).toMatch(/^\d+$/);
  });

  it('throws when entitlement node requires key but none is configured', async () => {
    client = new DidBoxClient({ ...config, autoPay: false });

    (global.fetch as any).mockResolvedValueOnce(mockDiscovery('entitlement'));

    await expect(client.store('cipher', 1)).rejects.toThrow('Entitlement key required');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('clearDiscoveryCache forces a fresh discovery fetch', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce(mockDiscovery())
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ items: [] }) });

    await client.getInbox();
    client.clearDiscoveryCache();

    (global.fetch as any)
      .mockResolvedValueOnce(mockDiscovery())
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ items: [] }) });

    await client.getInbox();
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('attaches entitlement header on entitlement nodes', async () => {
    client = new DidBoxClient({
      ...config,
      autoPay: false,
      entitlementKey: 'dbx_ent_test.secret',
    });

    (global.fetch as any)
      .mockResolvedValueOnce(mockDiscovery('entitlement'))
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ storageId: 'ent-1', rail: 'entitlement' }),
      });

    await client.store('cipher', 1);

    const storeHeaders = (global.fetch as any).mock.calls[1][1].headers;
    expect(storeHeaders.get('X-DIDBOX-Entitlement')).toBe('dbx_ent_test.secret');
  });
});
