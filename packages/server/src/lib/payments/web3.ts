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

      // Extract Transfer events
      const logs = receipt.logs;
      // TODO: Filter and parse logs for USDC Transfer matching recipient and amount
      // For v0.5.0 alpha, we return true if tx is successful.
      return true;
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
