export interface PaymentReceipt {
  amountPaid: string;
  currency: 'sats' | 'USDC' | 'none';
  rail: 'L402' | 'x402' | 'entitlement';
  /** @deprecated Use amountPaid + currency + rail */
  pricePaidSatoshis?: number;
  /** @deprecated Use amountPaid + currency + rail */
  additionalCostSatoshis?: number;
  /** @deprecated Use amountPaid + currency + rail */
  feePaid?: number;
}

export function buildPaymentReceipt(
  amount: number,
  rail: 'L402' | 'x402' = 'L402'
): PaymentReceipt {
  if (rail === 'x402') {
    const usdc = (amount / 100_000).toFixed(6);
    return {
      amountPaid: usdc,
      currency: 'USDC',
      rail: 'x402',
    };
  }

  return {
    amountPaid: String(amount),
    currency: 'sats',
    rail: 'L402',
    pricePaidSatoshis: amount,
    additionalCostSatoshis: amount,
    feePaid: amount,
  };
}

export function buildEntitlementReceipt(): PaymentReceipt {
  return {
    amountPaid: '0',
    currency: 'none',
    rail: 'entitlement',
  };
}