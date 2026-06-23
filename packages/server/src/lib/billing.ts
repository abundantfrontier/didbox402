import { verifyAnyPayment, issueDualChallenge } from './payments';
import { verifyEntitlement } from './entitlement';
import { buildPaymentReceipt, buildEntitlementReceipt, PaymentReceipt } from './payment-receipt';
import { Env } from '../types/env';

export type BillingMode = 'micropayment' | 'entitlement';

export function getBillingMode(env: Env): BillingMode {
  return env.BILLING_MODE === 'entitlement' ? 'entitlement' : 'micropayment';
}

type BillingResult =
  | { authorized: true; receipt: PaymentReceipt }
  | { authorized: false; response: Response };

export async function requireBilling(
  c: any,
  amount: number,
  leaseHours = 24
): Promise<BillingResult> {
  if (getBillingMode(c.env) === 'entitlement') {
    if (await verifyEntitlement(c)) {
      return { authorized: true, receipt: buildEntitlementReceipt() };
    }
    return {
      authorized: false,
      response: c.json(
        { error: 'Valid entitlement required', code: 'ENTITLEMENT_REQUIRED' },
        403
      ),
    };
  }

  if (await verifyAnyPayment(c, amount, leaseHours)) {
    const rail = c.req.header('PAYMENT-SIGNATURE') ? 'x402' : 'L402';
    return { authorized: true, receipt: buildPaymentReceipt(amount, rail) };
  }

  return { authorized: false, response: await issueDualChallenge(c, amount) };
}