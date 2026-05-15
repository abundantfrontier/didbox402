import { createPublicClient, http, parseAbiItem } from 'viem';
import { base } from 'viem/chains';

export interface Web3Provider {
  verifyUSDCPayment(txHash: string, amount: number, recipient: string): Promise<boolean>;
}

export class BaseUSDCProvider implements Web3Provider {
  private client;
  private usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Mainnet Base USDC

  constructor(rpcUrl?: string) {
    this.client = createPublicClient({
      chain: base,
      transport: http(rpcUrl)
    });
  }

  async verifyUSDCPayment(txHash: string, amount: number, recipient: string): Promise<boolean> {
    try {
      const receipt = await this.client.getTransactionReceipt({ hash: txHash as `0x${string}` });
      if (receipt.status !== 'success') return false;

      // USDC Transfer event ABI
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

          // amount is expected in USDC base units (6 decimals) when calling for x402
          const expectedValue = BigInt(Math.floor(amount * 1_000_000));

          if (to.toLowerCase() === recipient.toLowerCase() && value === expectedValue) {
            return true;
          }
        } catch {
          // not a Transfer event
          continue;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}

export class MockWeb3Provider implements Web3Provider {
  async verifyUSDCPayment(txHash: string, amount: number, recipient: string): Promise<boolean> {
    return txHash.startsWith('0x') && txHash.length === 66;
  }
}
