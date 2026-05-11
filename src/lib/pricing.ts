/**
 * Calculate the storage price in Satoshis.
 * Formula: (bytes / 1,048,576) * hours * baseRatePerMbHour
 */
export function calculateStoragePrice(
  sizeBytes: number,
  durationHours: number,
  baseRatePerMbHour: number
): number {
  const sizeMb = sizeBytes / (1024 * 1024);
  const cost = sizeMb * durationHours * baseRatePerMbHour;
  return Math.ceil(cost);
}

/**
 * Calculate the retrieval (egress) price in Satoshis.
 * Formula: (bytes / 1,048,576) * egressRatePerMb
 */
export function calculateRetrievalPrice(
  sizeBytes: number,
  egressRatePerMb: number
): number {
  const sizeMb = sizeBytes / (1024 * 1024);
  const cost = sizeMb * egressRatePerMb;
  return Math.ceil(cost);
}
