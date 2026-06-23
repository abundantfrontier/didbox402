import { expect, test, describe } from 'vitest';
import { calculateStoragePrice, calculateEgressPrice } from '../lib/pricing';
import { storageBytesFromCiphertext, transferBytesFromRetrieveBody } from '../lib/sizing';

describe('pricing and sizing (v0.8.0)', () => {
  test('storageBytes uses decoded base64 length', () => {
    const ciphertext = Buffer.from('hello').toString('base64');
    expect(storageBytesFromCiphertext(ciphertext)).toBe(5);
  });

  test('rejects invalid base64 ciphertext', () => {
    expect(storageBytesFromCiphertext('not!!!base64')).toBeNull();
  });

  test('storage pricing applies ceil and operator floor', () => {
    const oneByte = 1;
    expect(calculateStoragePrice(oneByte, 1, 100, 1)).toBe(100);

    const onePointFiveMb = Math.ceil(1.5 * 1024 * 1024);
    expect(calculateStoragePrice(onePointFiveMb, 2, 100, 1)).toBe(400);
  });

  test('operator-configured min_charge_mb floor is enforced', () => {
    const oneByte = 1;
    expect(calculateStoragePrice(oneByte, 1, 100, 2)).toBe(200);
  });

  test('egress pricing uses transfer bytes', () => {
    const ciphertext = Buffer.from('x'.repeat(500)).toString('base64');
    const transferBytes = transferBytesFromRetrieveBody(ciphertext);
    expect(transferBytes).toBeGreaterThan(500);
    expect(calculateEgressPrice(transferBytes, 10, 1)).toBeGreaterThan(0);
  });
});