import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DidBoxClient } from '../index';

describe('DidBoxClient', () => {
  const config = {
    baseUrl: 'http://test-node.local',
    did: 'did:key:z6Mktest',
    signRequest: vi.fn().mockResolvedValue('test_signature'),
    autoPay: true
  };

  let client: DidBoxClient;

  beforeEach(() => {
    client = new DidBoxClient(config);
    vi.clearAllMocks();
    // Global fetch mock
    global.fetch = vi.fn();
  });

  it('automatically handles 402 challenge-response flow', async () => {
    const mockInvoice = 'lnbc100n1p...';
    const mockPreimage = 'preimage_100_abc';

    // 1. First call returns 402
    (global.fetch as any)
      .mockResolvedValueOnce({
        status: 402,
        ok: false,
        headers: new Headers({ 'X-Invoice': mockInvoice }),
        json: async () => ({ amount_satoshis: 100, invoice: mockInvoice }),
        text: async () => 'Payment Required'
      })
      // 2. Second call (retry) returns 200
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ storageId: 'box-123' })
      });

    const result = await client.store('test data', 1);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.storageId).toBe('box-123');
    
    // Verify retry had the payment header
    const secondCallHeaders = (global.fetch as any).mock.calls[1][1].headers;
    expect(secondCallHeaders.get('X-Payment')).toBeDefined();
  });

  it('throws error if autoPay is false and 402 is received', async () => {
    client = new DidBoxClient({ ...config, autoPay: false });
    
    (global.fetch as any).mockResolvedValueOnce({
      status: 402,
      ok: false,
      json: async () => ({ amount_satoshis: 100 }),
      text: async () => 'Payment Required'
    });

    await expect(client.store('test', 1)).rejects.toThrow('Store failed: 402');
  });

  it('correctly includes X-DID-Timestamp in every request', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ items: [] })
    });

    await client.getInbox();
    
    const callHeaders = (global.fetch as any).mock.calls[0][1].headers;
    expect(callHeaders.get('X-DID-Timestamp')).toMatch(/^\d+$/);
  });
});
