import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

export interface Web3Provider {
  verifyUSDCPayment(txHash: string, amount: number, recipient: string): Promise<boolean>;
}

/**
 * Structured error for USDC / Web3 verification issues.
 */
export class USDCVerificationError extends Error {
  constructor(
    public code: 'TX_NOT_FOUND' | 'TX_FAILED' | 'WRONG_RECIPIENT' | 'WRONG_AMOUNT' | 'INVALID_EVENT' | 'NETWORK_ERROR' | 'UNKNOWN',
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'USDCVerificationError';
  }
}

export class BaseUSDCProvider implements Web3Provider {
  private client;
  private usdcAddress: string;

  constructor(rpcUrl?: string, usdcAddress?: string) {
    this.client = createPublicClient({
      chain: base,
      transport: http(rpcUrl || 'https://mainnet.base.org')
    });
    this.usdcAddress = usdcAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  }

  async verifyUSDCPayment(txHash: string, amount: number, recipient: string): Promise<boolean> {
    try {
      const receipt = await this.client.getTransactionReceipt({ hash: txHash as `0x${string}` });
      if (!receipt) {
        throw new USDCVerificationError('TX_NOT_FOUND', `Transaction not found: ${txHash}`);
      }

      if (receipt.status !== 'success') {
        throw new USDCVerificationError('TX_FAILED', `Transaction reverted: ${txHash}`);
      }

      const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== this.usdcAddress.toLowerCase()) continue;

        try {
          const decoded = this.client.decodeEventLog({
            abi: [transferEvent],
            data: log.data,
            topics: log.topics,
          });

          const to = (decoded.args as any).to as string;
          const value = (decoded.args as any).value as bigint;

          const expectedValue = BigInt(Math.floor(amount * 1_000_000));

          if (to.toLowerCase() !== recipient.toLowerCase()) {
            continue;
          }

          if (value !== expectedValue) {
            throw new USDCVerificationError(
              'WRONG_AMOUNT',
              `USDC amount mismatch. Expected ${expectedValue}, got ${value}`,
              { txHash, expected: expectedValue.toString(), received: value.toString() }
            );
          }

          return true;
        } catch (decodeErr) {
          if (decodeErr instanceof USDCVerificationError) throw decodeErr;
          continue;
        }
      }

      return false; // No matching Transfer event found
    } catch (error) {
      if (error instanceof USDCVerificationError) {
        console.warn(`USDC verification issue [${error.code}]: ${error.message}`);
        return false;
      }

      console.error('BaseUSDCProvider unexpected error:', error);
      throw new USDCVerificationError('NETWORK_ERROR', 'Failed to verify USDC payment on-chain', error);
    }
  }
}

export class MockWeb3Provider implements Web3Provider {
  async verifyUSDCPayment(txHash: string, amount: number, recipient: string): Promise<boolean> {
    // Very permissive mock — only used in DEV_MODE / tests
    return txHash.startsWith('0x') && txHash.length === 66;
  }
}
