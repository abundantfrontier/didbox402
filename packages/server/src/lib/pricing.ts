/**
 * Storage pricing: uses decoded ciphertext bytes and operator-configured floor.
 */
export function calculateStoragePrice(
  storageBytes: number,
  durationHours: number,
  baseRatePerMbHour: number,
  minChargeMb = 1
): number {
  const sizeMb = Math.max(minChargeMb, Math.ceil(storageBytes / 1048576));
  const cost = sizeMb * durationHours * baseRatePerMbHour;
  return Math.ceil(cost);
}

/**
 * Egress pricing: uses actual retrieve response body octets and operator floor.
 */
export function calculateEgressPrice(
  transferBytes: number,
  egressRatePerMb: number,
  minChargeMb = 1
): number {
  const transferMb = Math.max(minChargeMb, Math.ceil(transferBytes / 1048576));
  return Math.ceil(transferMb * egressRatePerMb);
}