import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/pricing.test.ts', 'src/__tests__/entitlement.test.ts'],
    environment: 'node',
  },
});